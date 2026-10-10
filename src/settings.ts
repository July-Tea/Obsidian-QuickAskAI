import { AbstractInputSuggest, App, PluginSettingTab, SearchResult, Setting, prepareFuzzySearch, renderMatches } from 'obsidian';
import type QuickAskAI from './main';
import { ModelInfo, listModels, testConnection } from './api';

// 输入框内容片段：纯文本，或 @ 引用的文件 chip
export type PromptSegment = string | { path: string };

export type ProviderId = 'deepseek' | 'openai';
export type ThinkingLevel = 'low' | 'high' | 'max';

export interface DeepseekConfig {
  apiKey: string;
  model: string;
  enableThinking: boolean;
  thinkingLevel: ThinkingLevel;
  // JSON 对象字符串，合并进请求体
  customParams: string;
}

export interface OpenAIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  customParams: string;
}

export interface QuickAskAISettings {
  provider: ProviderId;
  deepseek: DeepseekConfig;
  openai: OpenAIConfig;
  systemPromptPrefix: string;
  timeout: number;
  // 输入历史（不在设置页展示），最新的在末尾
  promptHistory: PromptSegment[][];
}

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const MAX_PROMPT_HISTORY = 50;

export const DEFAULT_SETTINGS: QuickAskAISettings = {
  provider: 'deepseek',
  deepseek: {
    apiKey: '',
    model: 'deepseek-chat',
    enableThinking: false,
    thinkingLevel: 'high',
    customParams: '',
  },
  openai: {
    baseUrl: '',
    apiKey: '',
    model: '',
    customParams: '',
  },
  systemPromptPrefix: 'You are a helpful assistant.',
  timeout: 10,
  promptHistory: [],
};

// 解析自定义参数，空字符串视为没有参数；格式错误时抛出异常
export function parseCustomParams(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const value = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('自定义参数必须是一个 JSON 对象，例如 {"temperature": 0.7}');
  }
  return value;
}

// 读取 data.json 并兼容旧版本（单一 baseUrl/apiKey/model 的扁平结构）
export function migrateSettings(data: any): QuickAskAISettings {
  const settings: QuickAskAISettings = {
    ...DEFAULT_SETTINGS,
    ...data,
    deepseek: { ...DEFAULT_SETTINGS.deepseek, ...data?.deepseek },
    openai: { ...DEFAULT_SETTINGS.openai, ...data?.openai },
  };

  if (data && !data.deepseek && !data.openai && (data.apiKey || data.model || data.baseUrl)) {
    const baseUrl: string = data.baseUrl || DEEPSEEK_BASE_URL;
    if (/^https?:\/\/api\.deepseek\.com\b/.test(baseUrl)) {
      settings.provider = 'deepseek';
      settings.deepseek = {
        ...settings.deepseek,
        apiKey: data.apiKey || '',
        model: data.model || settings.deepseek.model,
        enableThinking: !!data.enableThinking,
        thinkingLevel: data.thinkingLevel || settings.deepseek.thinkingLevel,
      };
    } else {
      settings.provider = 'openai';
      settings.openai = { ...settings.openai, baseUrl, apiKey: data.apiKey || '', model: data.model || '' };
    }
  }

  // 去掉旧版本遗留的扁平字段
  for (const key of ['baseUrl', 'apiKey', 'model', 'enableThinking', 'thinkingLevel']) {
    delete (settings as any)[key];
  }
  if (settings.provider !== 'deepseek' && settings.provider !== 'openai') settings.provider = 'deepseek';
  // Deepseek 的思考强度只有 low/high/max，旧版本的 medium 等价于 high
  if (!['low', 'high', 'max'].includes(settings.deepseek.thinkingLevel)) settings.deepseek.thinkingLevel = 'high';
  if (!Array.isArray(settings.promptHistory)) settings.promptHistory = [];
  return settings;
}

interface ModelMatch {
  model: ModelInfo;
  idMatch: SearchResult | null;
  nameMatch: SearchResult | null;
}

// Model 输入框的自动补全：获得焦点时按需获取模型列表，拿不到就不弹出，输入框照常手动填写
class ModelSuggest extends AbstractInputSuggest<ModelMatch> {
  private models: ModelInfo[] = [];
  // 本次聚焦后用户是否改过输入框内容
  private edited = false;

  constructor(
    app: App,
    private inputEl: HTMLInputElement,
    loadModels: () => Promise<ModelInfo[]>,
    onPick: (model: string) => void,
  ) {
    super(app, inputEl);
    this.onSelect(({ model }) => {
      this.setValue(model.id);
      onPick(model.id);
      this.close();
    });
    // 用捕获阶段，保证在组件自己的 input 处理（会调用 getSuggestions）之前记录；只认用户真实输入
    inputEl.addEventListener('input', (e) => {
      if (e.isTrusted) this.edited = true;
    }, true);
    inputEl.addEventListener('focus', async () => {
      this.edited = false;
      this.models = await loadModels();
      // 输入框为空时，列表到达后直接弹出供选择；已有模型名时等用户改动再弹
      if (this.models.length && !inputEl.value.trim() && document.activeElement === inputEl) {
        inputEl.dispatchEvent(new Event('input'));
      }
    });
  }

  open() {
    super.open();
    // suggestEl 不在公开类型里，拿不到时保持默认样式
    const suggestEl: HTMLElement | undefined = (this as any).suggestEl;
    suggestEl?.addClass('quick-ask-ai-model-suggest');
    suggestEl?.style.setProperty('--quick-ask-ai-suggest-width', `${this.inputEl.offsetWidth}px`);
  }

  getSuggestions(query: string): ModelMatch[] {
    const q = query.trim();
    // 刚聚焦、还没改动时不打扰：只有输入框为空才展示全部候选
    if (!this.edited && q) return [];
    if (!q) return this.models.map(model => ({ model, idMatch: null, nameMatch: null }));
    const fuzzy = prepareFuzzySearch(q);
    const matches: (ModelMatch & { score: number })[] = [];
    for (const model of this.models) {
      const idMatch = fuzzy(model.id);
      const nameMatch = model.name ? fuzzy(model.name) : null;
      if (!idMatch && !nameMatch) continue;
      const score = Math.max(idMatch?.score ?? -Infinity, nameMatch?.score ?? -Infinity);
      matches.push({ model, idMatch, nameMatch, score });
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  renderSuggestion({ model, idMatch, nameMatch }: ModelMatch, el: HTMLElement) {
    el.addClass('mod-complex');
    const content = el.createDiv({ cls: 'suggestion-content' });
    renderMatches(content.createDiv({ cls: 'suggestion-title' }), model.id, idMatch?.matches ?? null);
    if (model.name) {
      renderMatches(content.createDiv({ cls: 'suggestion-note' }), model.name, nameMatch?.matches ?? null);
    }
    if (model.id === this.inputEl.value.trim()) {
      el.createDiv({ cls: 'suggestion-aux' }).createSpan({ cls: 'suggestion-flair', text: '当前' });
    }
  }
}

export class QuickAskAISettingTab extends PluginSettingTab {
  plugin: QuickAskAI;
  // 模型列表缓存，按 "Base URL + API Key" 区分；关闭设置页时清空
  private modelCache = new Map<string, Promise<ModelInfo[]>>();

  constructor(app: App, plugin: QuickAskAI) {
    super(app, plugin);
    this.plugin = plugin;
  }

  hide(): void {
    this.modelCache.clear();
  }

  private loadModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
    if (!baseUrl) return Promise.resolve([]);
    const key = `${baseUrl}\n${apiKey}`;
    let models = this.modelCache.get(key);
    if (!models) {
      models = listModels(baseUrl, apiKey);
      this.modelCache.set(key, models);
    }
    return models;
  }

  private addModelSuggest(inputEl: HTMLInputElement, getEndpoint: () => { baseUrl: string; apiKey: string }, onPick: (model: string) => Promise<void>) {
    new ModelSuggest(
      this.app,
      inputEl,
      () => {
        const { baseUrl, apiKey } = getEndpoint();
        return this.loadModels(baseUrl, apiKey);
      },
      model => void onPick(model),
    );
  }

  display(): void {
    try {
      const { containerEl } = this;
      const settings = this.plugin.settings;

      containerEl.empty();

      containerEl.createEl('h2', { text: 'Quick Ask AI Settings' });

      new Setting(containerEl)
        .setName('Provider')
        .setDesc('AI 服务商')
        .addDropdown(dropdown =>
          dropdown
            .addOption('deepseek', 'Deepseek')
            .addOption('openai', 'OpenAI 兼容')
            .setValue(settings.provider)
            .onChange(async (value: string) => {
              settings.provider = value as ProviderId;
              await this.plugin.saveSettings();
              this.display();
            })
        );

      if (settings.provider === 'deepseek') {
        this.displayDeepseek(containerEl, settings.deepseek);
      } else {
        this.displayOpenAI(containerEl, settings.openai);
      }

      this.addConnectionTest(containerEl);

      new Setting(containerEl)
        .setName('System Prompt')
        .setDesc('Instructions to guide AI behavior')
        .addTextArea(text => {
          text
            .setPlaceholder('You are a helpful assistant.')
            .setValue(settings.systemPromptPrefix);
          text.inputEl.style.minHeight = '100px';
          text.onChange(async (value) => {
            settings.systemPromptPrefix = value;
            await this.plugin.saveSettings();
          });
          return text;
        });

      new Setting(containerEl)
        .setName('Timeout (seconds)')
        .setDesc('Request timeout for first response (default: 10s)')
        .addText(text =>
          text
            .setPlaceholder('10')
            .setValue(String(settings.timeout))
            .onChange(async (value) => {
              settings.timeout = parseInt(value) || 10;
              await this.plugin.saveSettings();
            })
        );
    } catch (error) {
      console.error('Error displaying settings:', error);
    }
  }

  private displayDeepseek(containerEl: HTMLElement, config: DeepseekConfig) {
    this.addApiKey(containerEl, config, 'Deepseek API 密钥（默认隐藏）');

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Deepseek 模型名称')
      .addText(text => {
        text
          .setPlaceholder('deepseek-chat')
          .setValue(config.model)
          .onChange(async (value) => {
            config.model = value.trim() || DEFAULT_SETTINGS.deepseek.model;
            await this.plugin.saveSettings();
          });
        this.addModelSuggest(
          text.inputEl,
          () => ({ baseUrl: config.apiKey ? DEEPSEEK_BASE_URL : '', apiKey: config.apiKey }),
          async (model) => {
            config.model = model;
            await this.plugin.saveSettings();
          },
        );
      });

    new Setting(containerEl)
      .setName('Enable Thinking Mode')
      .setDesc('开启思考模式（更慢、消耗更多 token）。关闭时会显式禁用思考，避免默认思考的模型变慢')
      .addToggle(toggle =>
        toggle
          .setValue(config.enableThinking)
          .onChange(async (value) => {
            config.enableThinking = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (config.enableThinking) {
      new Setting(containerEl)
        .setName('Thinking Level')
        .setDesc('How deep the AI should think (higher = more reasoning)')
        .addDropdown(dropdown =>
          dropdown
            .addOption('low', 'Low')
            .addOption('high', 'High (recommended)')
            .addOption('max', 'Max')
            .setValue(config.thinkingLevel)
            .onChange(async (value: string) => {
              config.thinkingLevel = value as ThinkingLevel;
              await this.plugin.saveSettings();
            })
        );
    }

    this.addCustomParams(containerEl, config, '{"temperature": 0.7}');
  }

  private displayOpenAI(containerEl: HTMLElement, config: OpenAIConfig) {
    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('接口地址，请求会发往 {Base URL}/chat/completions')
      .addText(text =>
        text
          .setPlaceholder('https://api.openai.com/v1')
          .setValue(config.baseUrl)
          .onChange(async (value) => {
            config.baseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    this.addApiKey(containerEl, config, 'API 密钥（默认隐藏，本地服务可留空）');

    new Setting(containerEl)
      .setName('Model')
      .setDesc('模型名称')
      .addText(text => {
        text
          .setPlaceholder('gpt-4o-mini')
          .setValue(config.model)
          .onChange(async (value) => {
            config.model = value.trim();
            await this.plugin.saveSettings();
          });
        this.addModelSuggest(
          text.inputEl,
          () => ({ baseUrl: config.baseUrl, apiKey: config.apiKey }),
          async (model) => {
            config.model = model;
            await this.plugin.saveSettings();
          },
        );
      });

    this.addCustomParams(
      containerEl,
      config,
      '{\n  "temperature": 0.7,\n  "reasoning_effort": "low"\n}'
    );
  }

  private addConnectionTest(containerEl: HTMLElement) {
    const setting = new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('使用当前服务商配置发送一条简短消息，检查能否正常响应');

    const statusEl = setting.descEl.createDiv({ cls: 'quick-ask-ai-test-status' });
    const setStatus = (state: 'testing' | 'success' | 'error', text: string) => {
      statusEl.className = `quick-ask-ai-test-status is-${state}`;
      statusEl.setText(text);
    };

    setting.addButton(button =>
      button
        .setButtonText('测试连接')
        .setCta()
        .onClick(async () => {
          button.setDisabled(true).setButtonText('测试中…');
          setStatus('testing', '正在连接…');
          try {
            const latency = await testConnection(this.plugin.settings);
            setStatus('success', `连接成功 · 首包响应 ${latency} ms`);
          } catch (e) {
            setStatus('error', `连接失败：${e instanceof Error ? e.message : String(e)}`);
          } finally {
            button.setDisabled(false).setButtonText('测试连接');
          }
        })
    );
  }

  private addApiKey(containerEl: HTMLElement, config: { apiKey: string }, desc: string) {
    new Setting(containerEl)
      .setName('API Key')
      .setDesc(desc)
      .addText(text => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('sk-...')
          .setValue(config.apiKey)
          .onChange(async (value) => {
            config.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }

  private addCustomParams(containerEl: HTMLElement, config: { customParams: string }, placeholder: string) {
    const setting = new Setting(containerEl)
      .setName('Custom Parameters')
      .setDesc('JSON 对象，会合并进请求体，可覆盖默认参数（如 temperature、top_p、max_tokens 或服务商特有参数）。messages 和 stream 不可覆盖');

    const errorEl = setting.descEl.createDiv();
    errorEl.style.color = 'var(--text-error)';

    const validate = (value: string) => {
      try {
        parseCustomParams(value);
        errorEl.setText('');
      } catch (e) {
        errorEl.setText(`格式错误：${e instanceof Error ? e.message : String(e)}`);
      }
    };

    setting.addTextArea(text => {
      text
        .setPlaceholder(placeholder)
        .setValue(config.customParams);
      text.inputEl.style.minHeight = '100px';
      text.inputEl.style.fontFamily = 'var(--font-monospace)';
      text.onChange(async (value) => {
        config.customParams = value;
        validate(value);
        await this.plugin.saveSettings();
      });
      return text;
    });

    validate(config.customParams);
  }
}
