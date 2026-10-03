import { App, Modal, Notice, Editor, FuzzyMatch, prepareFuzzySearch } from 'obsidian';
import { DeepseekAPI } from './api';
import { QuickAskAISettings } from './settings';

export class QuickAskModal extends Modal {
  private api: DeepseekAPI;
  private settings: QuickAskAISettings;
  private editor: Editor;
  private result: string = '';
  private isLoading: boolean = false;
  private textareaEl: HTMLTextAreaElement | null = null;
  private mentionListEl: HTMLDivElement | null = null;
  private allFiles: string[] = [];
  private mentionStartIndex: number = -1;

  constructor(app: App, settings: QuickAskAISettings, editor: Editor) {
    super(app);
    this.settings = settings;
    this.api = new DeepseekAPI(settings);
    this.editor = editor;
    this.loadAllFiles();
  }

  private loadAllFiles(): void {
    const files = this.app.vault.getMarkdownFiles();
    this.allFiles = files.map(f => f.path);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('quick-ask-ai-modal');

    contentEl.createEl('h2', { text: 'Quick Ask AI' });

    let promptInput = '';

    const textareaContainer = contentEl.createEl('div', { cls: 'quick-ask-textarea-container' });
    textareaContainer.style.position = 'relative';

    this.textareaEl = textareaContainer.createEl('textarea', { cls: 'quick-ask-textarea' });
    this.textareaEl.placeholder = 'What would you like to ask? (Use @filename to reference files)';
    this.textareaEl.style.minHeight = '120px';
    this.textareaEl.style.width = '100%';
    this.textareaEl.style.padding = '8px';
    this.textareaEl.style.border = '1px solid var(--background-modifier-border)';
    this.textareaEl.style.borderRadius = '4px';
    this.textareaEl.style.fontFamily = 'var(--font-monospace)';
    this.textareaEl.style.fontSize = '14px';
    this.textareaEl.style.backgroundColor = 'var(--background-primary)';
    this.textareaEl.style.color = 'var(--text-normal)';
    this.textareaEl.style.resize = 'vertical';

    this.textareaEl.addEventListener('input', (e) => {
      promptInput = (e.target as HTMLTextAreaElement).value;
      this.handleMentionInput(promptInput, e.target as HTMLTextAreaElement, textareaContainer);
    });

    this.textareaEl.addEventListener('keydown', (e) => {
      if (this.mentionListEl && this.mentionListEl.style.display !== 'none') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          this.navigateMentionList(e.key === 'ArrowDown');
          e.preventDefault();
        } else if (e.key === 'Enter') {
          const selected = this.mentionListEl.querySelector('.quick-ask-mention-item.selected');
          if (selected) {
            this.selectMentionFile(selected.textContent || '', promptInput, e.target as HTMLTextAreaElement);
            e.preventDefault();
          }
        } else if (e.key === 'Escape') {
          this.hideMentionList();
        }
      }
    });

    this.textareaEl.focus();

    const statusEl = contentEl.createEl('div', { cls: 'quick-ask-status', text: '' });
    statusEl.style.display = 'none';

    const buttonContainer = contentEl.createEl('div', { cls: 'quick-ask-buttons' });

    const submitBtn = buttonContainer.createEl('button', { text: 'Ask' });
    submitBtn.addClass('mod-cta');

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });

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

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!this.isLoading && promptInput.trim() && document.activeElement === this.textareaEl) {
          this.handleSubmit(promptInput, submitBtn, statusEl);
        }
      }
    });
  }

  private handleMentionInput(text: string, textarea: HTMLTextAreaElement, container: HTMLElement): void {
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) {
      this.hideMentionList();
      return;
    }

    const afterAt = textBeforeCursor.substring(lastAtIndex + 1);

    // Check if @ is preceded by space or is at start
    if (lastAtIndex > 0 && !/\s/.test(text[lastAtIndex - 1])) {
      this.hideMentionList();
      return;
    }

    // Check if text after @ contains spaces (mention complete or invalid)
    if (/\s/.test(afterAt)) {
      this.hideMentionList();
      return;
    }

    this.mentionStartIndex = lastAtIndex;
    this.showMentionList(afterAt, container);
  }

  private showMentionList(query: string, container: HTMLElement): void {
    let mentionList = this.mentionListEl;

    if (!mentionList) {
      mentionList = container.createEl('div', { cls: 'quick-ask-mention-list' });
      this.mentionListEl = mentionList;
    }

    mentionList.style.display = 'block';
    mentionList.empty();

    const matches = this.allFiles
      .filter(file => file.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8);

    if (matches.length === 0) {
      mentionList.createEl('div', { text: 'No files found', cls: 'quick-ask-mention-item' });
      return;
    }

    matches.forEach((file, index) => {
      const item = mentionList!.createEl('div', { cls: 'quick-ask-mention-item', text: file });
      if (index === 0) item.classList.add('selected');
      item.addEventListener('click', () => {
        this.selectMentionFile(file, this.textareaEl?.value || '', this.textareaEl!);
      });
    });
  }

  private hideMentionList(): void {
    if (this.mentionListEl) {
      this.mentionListEl.style.display = 'none';
    }
  }

  private navigateMentionList(down: boolean): void {
    if (!this.mentionListEl) return;

    const items = Array.from(this.mentionListEl.querySelectorAll('.quick-ask-mention-item'));
    const selected = this.mentionListEl.querySelector('.quick-ask-mention-item.selected') as HTMLElement;

    if (!selected) return;

    const currentIndex = items.indexOf(selected);
    let nextIndex = down ? currentIndex + 1 : currentIndex - 1;

    if (nextIndex < 0) nextIndex = items.length - 1;
    if (nextIndex >= items.length) nextIndex = 0;

    items.forEach((item, i) => {
      item.classList.toggle('selected', i === nextIndex);
    });
  }

  private selectMentionFile(filePath: string, currentText: string, textarea: HTMLTextAreaElement): void {
    const cursorPos = textarea.selectionStart;
    const beforeAt = currentText.substring(0, this.mentionStartIndex);
    const afterCursor = currentText.substring(cursorPos);

    // Replace @query with @filePath
    const newText = beforeAt + '@' + filePath + ' ' + afterCursor;
    this.textareaEl!.value = newText;

    // Trigger input event to update promptInput
    const event = new Event('input', { bubbles: true });
    this.textareaEl!.dispatchEvent(event);

    this.hideMentionList();
    this.textareaEl!.focus();
    this.textareaEl!.setSelectionRange(beforeAt.length + filePath.length + 2, beforeAt.length + filePath.length + 2);
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
    this.hideMentionList();

    try {
      // Extract file references from prompt
      const fileRegex = /@[\w\/.-]+\.md/g;
      const fileMatches = prompt.match(fileRegex) || [];
      let finalPrompt = prompt;

      // Read and append file contents
      for (const fileMatch of fileMatches) {
        const filePath = fileMatch.substring(1); // Remove @
        try {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file && file.path) {
            const content = await this.app.vault.read(file as any);
            finalPrompt = finalPrompt.replace(fileMatch, `\n\`\`\`\n${content}\n\`\`\``);
          }
        } catch (error) {
          console.error(`Failed to read file ${filePath}:`, error);
        }
      }

      const response = await this.api.chat(finalPrompt);
      this.result = response;

      const cursor = this.editor.getCursor();
      const selection = this.editor.getSelection();

      if (selection) {
        this.editor.replaceSelection(response);
      } else {
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
