import { requestUrl } from 'obsidian';
import { QuickAskAISettings, DEEPSEEK_BASE_URL, parseCustomParams } from './settings';

export interface MessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// reasoning 只用于判断"已开始响应"（首包超时），不会写进笔记
export interface StreamDelta {
  kind: 'content' | 'reasoning';
  text: string;
}

interface RequestConfig {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
}

// 按当前服务商构造请求；配置不完整时抛出异常
export function buildRequest(settings: QuickAskAISettings, messages: MessageParam[]): RequestConfig {
  let url: string;
  let apiKey: string;
  let body: Record<string, unknown>;

  if (settings.provider === 'deepseek') {
    const config = settings.deepseek;
    if (!config.apiKey) throw new Error('请先在插件设置中配置 Deepseek API Key');
    url = `${DEEPSEEK_BASE_URL}/chat/completions`;
    apiKey = config.apiKey;
    body = {
      model: config.model,
      temperature: 1.0,
      // 部分模型默认开启思考，所以关闭时也要显式传 disabled
      thinking: { type: config.enableThinking ? 'enabled' : 'disabled' },
    };
    if (config.enableThinking) {
      body.reasoning_effort = config.thinkingLevel;
    }
    Object.assign(body, parseConfigParams(config.customParams));
  } else {
    const config = settings.openai;
    if (!config.baseUrl) throw new Error('请先在插件设置中配置 Base URL');
    if (!config.model) throw new Error('请先在插件设置中配置模型名称');
    url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    apiKey = config.apiKey;
    body = {
      model: config.model,
      temperature: 1.0,
    };
    Object.assign(body, parseConfigParams(config.customParams));
  }

  // messages/stream 由插件控制，不允许被自定义参数覆盖
  body.messages = messages;
  body.stream = true;
  return { url, apiKey, body };
}

function parseConfigParams(text: string): Record<string, unknown> {
  try {
    return parseCustomParams(text);
  } catch (e) {
    throw new Error(`自定义参数格式错误：${e instanceof Error ? e.message : String(e)}`);
  }
}

export class ChatAPI {
  private settings: QuickAskAISettings;

  constructor(settings: QuickAskAISettings) {
    this.settings = settings;
  }

  async *chatStream(userMessage: string, signal: AbortSignal): AsyncGenerator<StreamDelta> {
    const { url, apiKey, body } = buildRequest(this.settings, [
      {
        role: 'system',
        content: this.settings.systemPromptPrefix
      },
      {
        role: 'user',
        content: userMessage
      }
    ]);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errorText = await response.text();
        try {
          detail = JSON.parse(errorText).error?.message || errorText;
        } catch (e) {
          detail = errorText;
        }
      } catch (e) {
        // Could not read error response
      }
      throw new Error(`API Error: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          return;
        }
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta;
          // 不同服务商的思考内容字段名不同（Deepseek/Qwen: reasoning_content，OpenRouter 等: reasoning）
          const reasoning = delta?.reasoning_content || delta?.reasoning;
          if (typeof reasoning === 'string' && reasoning) {
            yield { kind: 'reasoning', text: reasoning };
          }
          if (delta?.content) {
            yield { kind: 'content', text: delta.content };
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }
}

// 连通性测试：发送一条简短消息，收到首个响应片段即视为成功，返回首包耗时（毫秒）
export async function testConnection(settings: QuickAskAISettings): Promise<number> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, settings.timeout * 1000);
  const start = performance.now();

  try {
    const api = new ChatAPI(settings);
    for await (const _ of api.chatStream('Hi', controller.signal)) {
      return Math.round(performance.now() - start);
    }
    throw new Error('服务端未返回任何内容');
  } catch (e) {
    if (timedOut) throw new Error(`请求超时（${settings.timeout}s 内无响应）`);
    throw e;
  } finally {
    window.clearTimeout(timeoutId);
    // 已拿到首包，不需要等完整回复
    controller.abort();
  }
}

export interface ModelInfo {
  id: string;
  // 服务商提供的展示名（如 Gemini 的 display_name），没有则为空
  name: string;
}

// 获取模型列表（GET {baseUrl}/models）；接口不支持、Key 错误、返回的不是 JSON 或网络失败时返回空数组，不打扰用户
export async function listModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const response = await requestUrl({
      url: `${baseUrl.replace(/\/+$/, '')}/models`,
      headers,
      throw: false,
    });
    if (response.status < 200 || response.status >= 300) return [];
    return parseModelList(response.json);
  } catch (e) {
    return [];
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// 兼容各家 /models 的返回格式，认不出来的条目直接跳过：
// - OpenAI 兼容：{ data: [{ id }] }（OpenRouter 另有 name，Anthropic/Gemini 另有 display_name）
// - 直接返回数组：[{ id }] 或 ["id"]
// - Gemini/Ollama 原生：{ models: [{ name: "models/xxx", displayName }] }
export function parseModelList(json: unknown): ModelInfo[] {
  const root = json as any;
  const items: unknown[] = Array.isArray(root) ? root
    : Array.isArray(root?.data) ? root.data
    : Array.isArray(root?.models) ? root.models
    : [];

  const models = new Map<string, ModelInfo>();
  for (const item of items) {
    const obj = item && typeof item === 'object' ? (item as any) : {};
    const raw = typeof item === 'string' ? item.trim() : str(obj.id) || str(obj.model) || str(obj.name);
    // 只去掉 Gemini 的 "models/" 前缀；"openai/gpt-4o" 这类带厂商前缀的 id 是完整名称，必须保留
    const id = raw.replace(/^models\//, '');
    if (!id || /\s/.test(id)) continue;
    const label = str(obj.display_name) || str(obj.displayName) || (str(obj.id) ? str(obj.name) : '');
    const name = label && label !== id && label !== raw ? label : '';
    if (!models.has(id)) models.set(id, { id, name });
  }
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}
