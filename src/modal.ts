import { App, Modal, Setting, Notice, Editor } from 'obsidian';
import { DeepseekAPI } from './api';
import { QuickAskAISettings } from './settings';

export class QuickAskModal extends Modal {
  private api: DeepseekAPI;
  private settings: QuickAskAISettings;
  private editor: Editor;
  private result: string = '';
  private isLoading: boolean = false;

  constructor(app: App, settings: QuickAskAISettings, editor: Editor) {
    super(app);
    this.settings = settings;
    this.api = new DeepseekAPI(settings);
    this.editor = editor;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('quick-ask-ai-modal');

    contentEl.createEl('h2', { text: 'Quick Ask AI' });

    let promptInput = '';

    new Setting(contentEl)
      .setName('Prompt')
      .setDesc('Enter your question or prompt')
      .addTextArea(text => {
        text
          .setPlaceholder('What would you like to ask?')
          .onChange((value) => {
            promptInput = value;
          });
        text.inputEl.style.minHeight = '120px';
        text.inputEl.focus();
      });

    const statusEl = contentEl.createEl('div', { cls: 'quick-ask-status', text: '' });
    statusEl.style.display = 'none';
    statusEl.style.marginTop = '10px';
    statusEl.style.fontSize = '14px';
    statusEl.style.color = '#666';

    const buttonContainer = contentEl.createEl('div', { cls: 'quick-ask-buttons' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';
    buttonContainer.style.marginTop = '15px';
    buttonContainer.style.justifyContent = 'flex-end';

    const submitBtn = buttonContainer.createEl('button', { text: 'Ask' });
    submitBtn.addClass('mod-cta');
    submitBtn.style.cursor = 'pointer';

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.style.cursor = 'pointer';

    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    submitBtn.addEventListener('click', async () => {
      if (!promptInput.trim()) {
        new Notice('Please enter a prompt');
        return;
      }

      if (!this.settings.apiKey) {
        new Notice('Please configure API Key in settings');
        return;
      }

      await this.handleSubmit(promptInput, submitBtn, statusEl);
    });

    // Allow Enter+Ctrl/Cmd to submit
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!this.isLoading && promptInput.trim()) {
          this.handleSubmit(promptInput, submitBtn, statusEl);
        }
      }
    });
  }

  private async handleSubmit(
    prompt: string,
    submitBtn: HTMLButtonElement,
    statusEl: HTMLElement
  ): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    statusEl.style.display = 'block';
    statusEl.textContent = 'Waiting for response...';

    try {
      const response = await this.api.chat(prompt);
      this.result = response;

      // Insert the result into the editor
      const cursor = this.editor.getCursor();
      const selection = this.editor.getSelection();

      if (selection) {
        // Replace selected text
        this.editor.replaceSelection(response);
      } else {
        // Insert at cursor position
        this.editor.replaceRange(response, cursor);
      }

      new Notice('Response inserted successfully');
      this.close();
    } catch (error) {
      new Notice(`Error: ${error.message}`);
      statusEl.textContent = `Error: ${error.message}`;
    } finally {
      this.isLoading = false;
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      statusEl.style.display = 'none';
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
