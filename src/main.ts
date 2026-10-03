import { Plugin } from 'obsidian';
import { QuickAskAISettings, QuickAskAISettingTab, DEFAULT_SETTINGS } from './settings';
import { QuickAskModal } from './modal';
import { STYLES_CSS } from './styles';

export default class QuickAskAI extends Plugin {
  settings: QuickAskAISettings;

  async onload() {
    await this.loadSettings();

    // Add styles
    this.addStyle(STYLES_CSS);

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
