import { App, Notice, Editor } from 'obsidian';
import { DeepseekAPI } from './api';
import { QuickAskAISettings } from './settings';

export class QuickAskModal {
  private api: DeepseekAPI;
  private settings: QuickAskAISettings;
  private editor: Editor;
  private app: App;
  private isLoading: boolean = false;
  private allFiles: string[] = [];
  private container: HTMLElement | null = null;

  constructor(app: App, settings: QuickAskAISettings, editor: Editor) {
    this.app = app;
    this.settings = settings;
    this.api = new DeepseekAPI(settings);
    this.editor = editor;
    this.loadAllFiles();
  }

  private loadAllFiles(): void {
    const files = this.app.vault.getMarkdownFiles();
    this.allFiles = files.map(f => f.path);
  }

  open(): void {
    const cmEditor = document.querySelector('.cm-editor') as HTMLElement;
    const contentEl = document.querySelector('.cm-content') as HTMLElement;
    if (!cmEditor || !contentEl) return;

    this.container = document.createElement('div');
    this.container.className = 'quick-ask-inline-container';

    // 直接插入到编辑器内容区
    contentEl.appendChild(this.container);

    const inputContainer = this.container.createEl('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.gap = '8px';
    inputContainer.style.alignItems = 'flex-start';
    inputContainer.style.padding = '8px 0';
    inputContainer.style.position = 'relative';

    const textarea = inputContainer.createEl('textarea');
    textarea.placeholder = '@ 引用 • Enter 发送 • Esc 取消';
    textarea.style.flex = '1';
    textarea.style.minHeight = '40px';
    textarea.style.padding = '8px';
    textarea.style.border = '1px solid var(--background-modifier-border)';
    textarea.style.borderRadius = '4px';
    textarea.style.fontSize = '13px';
    textarea.style.fontFamily = 'var(--font-monospace)';
    textarea.style.resize = 'none';
    textarea.style.backgroundColor = 'var(--background-secondary)';
    textarea.style.color = 'var(--text-normal)';
    textarea.style.fontWeight = '400';

    const sendBtn = inputContainer.createEl('button');
    sendBtn.textContent = '➤';
    sendBtn.style.padding = '8px 12px';
    sendBtn.style.height = '40px';
    sendBtn.style.border = 'none';
    sendBtn.style.background = 'var(--interactive-accent)';
    sendBtn.style.color = 'white';
    sendBtn.style.borderRadius = '4px';
    sendBtn.style.cursor = 'pointer';
    sendBtn.style.fontSize = '16px';
    sendBtn.style.fontWeight = 'bold';

    let mentionList: HTMLDivElement | null = null;
    let mentionStartIndex = -1;

    const showMentionList = (query: string) => {
      if (!mentionList) {
        mentionList = inputContainer.createEl('div', { cls: 'quick-ask-mention-list' });
        mentionList.style.position = 'absolute';
        mentionList.style.top = '50px';
        mentionList.style.left = '0';
        mentionList.style.background = 'var(--background-secondary)';
        mentionList.style.border = '1px solid var(--background-modifier-border)';
        mentionList.style.borderRadius = '4px';
        mentionList.style.maxHeight = '120px';
        mentionList.style.overflowY = 'auto';
        mentionList.style.minWidth = '280px';
        mentionList.style.zIndex = '1000';
      }

      mentionList.empty();
      const matches = this.allFiles
        .filter(f => f.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5);

      if (matches.length === 0) {
        mentionList.style.display = 'none';
        return;
      }

      mentionList.style.display = 'block';
      matches.forEach((file, i) => {
        const item = mentionList!.createEl('div', { cls: 'quick-ask-mention-item', text: file });
        item.style.padding = '6px 10px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '12px';
        if (i === 0) item.style.background = 'var(--interactive-accent)';
        item.addEventListener('click', () => {
          const cursorPos = textarea.selectionStart;
          const text = textarea.value;
          const beforeAt = text.substring(0, mentionStartIndex);
          const afterCursor = text.substring(cursorPos);
          textarea.value = beforeAt + '@' + file + ' ' + afterCursor;
          mentionList!.style.display = 'none';
          textarea.focus();
        });
      });
    };

    const hideMentionList = () => {
      if (mentionList) mentionList.style.display = 'none';
    };

    textarea.addEventListener('input', () => {
      const cursorPos = textarea.selectionStart;
      const text = textarea.value.substring(0, cursorPos);
      const lastAt = text.lastIndexOf('@');

      if (lastAt === -1 || (lastAt > 0 && !/\s/.test(textarea.value[lastAt - 1]))) {
        hideMentionList();
        return;
      }

      const afterAt = text.substring(lastAt + 1);
      if (/\s/.test(afterAt)) {
        hideMentionList();
        return;
      }

      mentionStartIndex = lastAt;
      showMentionList(afterAt);
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submit(textarea.value, sendBtn);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    sendBtn.addEventListener('click', () => {
      this.submit(textarea.value, sendBtn);
    });

    // 点击外部关闭
    const closeOnClickOutside = (e: MouseEvent) => {
      if (this.container && !this.container.contains(e.target as Node)) {
        this.close();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeOnClickOutside);
    }, 0);

    this.container.addEventListener('close-modal', () => {
      document.removeEventListener('click', closeOnClickOutside);
    });

    textarea.focus();
  }

  private async submit(prompt: string, sendBtn: HTMLButtonElement): Promise<void> {
    if (this.isLoading || !prompt.trim()) return;
    if (!this.settings.apiKey) {
      new Notice('请先配置 API Key');
      return;
    }

    this.isLoading = true;
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.6';

    const cursor = this.editor.getCursor();

    try {
      const fileRegex = /@[\w\/.-]+\.md/g;
      const fileMatches = prompt.match(fileRegex) || [];
      let finalPrompt = prompt;

      for (const fileMatch of fileMatches) {
        const filePath = fileMatch.substring(1);
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
      const selection = this.editor.getSelection();

      if (selection) {
        this.editor.replaceSelection(response);
      } else {
        this.editor.replaceRange(response, cursor);
      }

      new Notice('✓');
      this.close();
    } catch (error) {
      new Notice(`✗ ${error.message}`);
    } finally {
      this.isLoading = false;
      sendBtn.disabled = false;
      sendBtn.style.opacity = '1';
    }
  }

  private close(): void {
    if (this.container) {
      this.container.dispatchEvent(new Event('close-modal'));
      this.container.remove();
      this.container = null;
    }
  }
}
