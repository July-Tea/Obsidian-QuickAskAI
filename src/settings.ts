import { App, PluginSettingTab, Setting } from 'obsidian';
import QuickAskAI from './main';

export interface QuickAskAISettings {
  provider: 'deepseek';
  apiKey: string;
  model: string;
  enableThinking: boolean;
  thinkingLevel: 'low' | 'medium' | 'high';
  systemPromptPrefix: string;
}

export const DEFAULT_SETTINGS: QuickAskAISettings = {
  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-chat',
  enableThinking: false,
  thinkingLevel: 'medium',
  systemPromptPrefix: 'You are a helpful assistant.'
};

export class QuickAskAISettingTab extends PluginSettingTab {
  plugin: QuickAskAI;

  constructor(app: App, plugin: QuickAskAI) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Quick Ask AI Settings' });

    new Setting(containerEl)
      .setName('Provider')
      .setDesc('AI Provider')
      .addDropdown(dropdown =>
        dropdown
          .addOption('deepseek', 'Deepseek')
          .setValue(this.plugin.settings.provider)
          .onChange(async (value: string) => {
            this.plugin.settings.provider = value as 'deepseek';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your Deepseek API Key')
      .addText(text =>
        text
          .setPlaceholder('Enter your API Key')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Select the Deepseek model')
      .addDropdown(dropdown =>
        dropdown
          .addOption('deepseek-chat', 'deepseek-chat')
          .addOption('deepseek-reasoner', 'deepseek-reasoner (R1)')
          .addOption('deepseek-v4-flash', 'deepseek-v4-flash')
          .addOption('deepseek-v4-pro', 'deepseek-v4-pro')
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Enable Thinking')
      .setDesc('Enable reasoning/thinking mode for Deepseek')
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableThinking)
          .onChange(async (value) => {
            this.plugin.settings.enableThinking = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.enableThinking) {
      new Setting(containerEl)
        .setName('Thinking Level')
        .setDesc('How deep the AI should think')
        .addDropdown(dropdown =>
          dropdown
            .addOption('low', 'Low')
            .addOption('medium', 'Medium')
            .addOption('high', 'High')
            .setValue(this.plugin.settings.thinkingLevel)
            .onChange(async (value: string) => {
              this.plugin.settings.thinkingLevel = value as 'low' | 'medium' | 'high';
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName('System Prompt Prefix')
      .setDesc('Custom system prompt prefix to guide AI responses')
      .addTextArea(text =>
        text
          .setPlaceholder('You are a helpful assistant.')
          .setValue(this.plugin.settings.systemPromptPrefix)
          .onChange(async (value) => {
            this.plugin.settings.systemPromptPrefix = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
