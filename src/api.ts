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
