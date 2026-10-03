import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';

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
  plugin: any;

  constructor(app: App, plugin: Plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    try {
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
        .setDesc('Your Deepseek API Key from https://platform.deepseek.com')
        .addText(text =>
          text
            .setPlaceholder('sk-...')
            .setValue(this.plugin.settings.apiKey)
            .onChange(async (value) => {
              this.plugin.settings.apiKey = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Model')
        .setDesc('Select the Deepseek model to use')
        .addDropdown(dropdown =>
          dropdown
            .addOption('deepseek-chat', 'deepseek-chat (recommended)')
            .addOption('deepseek-reasoner', 'deepseek-reasoner (R1 - better reasoning)')
            .addOption('deepseek-v4-flash', 'deepseek-v4-flash (faster)')
            .addOption('deepseek-v4-pro', 'deepseek-v4-pro (best quality)')
            .setValue(this.plugin.settings.model)
            .onChange(async (value) => {
              this.plugin.settings.model = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Enable Thinking Mode')
        .setDesc('Enable AI reasoning/thinking capability (uses more tokens)')
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
          .setDesc('How deep the AI should think (higher = more reasoning)')
          .addDropdown(dropdown =>
            dropdown
              .addOption('low', 'Low')
              .addOption('medium', 'Medium (recommended)')
              .addOption('high', 'High')
              .setValue(this.plugin.settings.thinkingLevel)
              .onChange(async (value: string) => {
                this.plugin.settings.thinkingLevel = value as 'low' | 'medium' | 'high';
                await this.plugin.saveSettings();
              })
          );
      }

      new Setting(containerEl)
        .setName('System Prompt')
        .setDesc('Instructions to guide AI behavior (use @filename.md to reference files)')
        .addTextArea(text => {
          text
            .setPlaceholder('You are a helpful assistant.')
            .setValue(this.plugin.settings.systemPromptPrefix);
          text.inputEl.style.minHeight = '100px';
          text.onChange(async (value) => {
            this.plugin.settings.systemPromptPrefix = value;
            await this.plugin.saveSettings();
          });
          return text;
        });
    } catch (error) {
      console.error('Error displaying settings:', error);
    }
  }
}
