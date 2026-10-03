import { Plugin } from 'obsidian';
import { QuickAskAISettings, QuickAskAISettingTab, DEFAULT_SETTINGS } from './settings';
import { QuickAskModal } from './modal';
import { STYLES_CSS } from './styles';

export default class QuickAskAI extends Plugin {
  settings: QuickAskAISettings;

  async onload() {
    try {
      await this.loadSettings();

      // Add styles
      const styleEl = document.createElement('style');
      styleEl.textContent = STYLES_CSS;
      document.head.appendChild(styleEl);

      // Add settings tab
      this.addSettingTab(new QuickAskAISettingTab(this.app, this));

      // Register command
      this.addCommand({
        id: 'quick-ask-ai',
        name: 'Quick Ask AI',
        editorCallback: (editor) => {
          new QuickAskModal(this.app, this.settings, editor).open();
        },
      });

      console.log('Quick Ask AI plugin loaded successfully');
    } catch (error) {
      console.error('Error loading Quick Ask AI plugin:', error);
    }
  }

  onunload() {
    console.log('Unloading Quick Ask AI plugin');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
