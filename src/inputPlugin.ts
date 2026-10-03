import { StateEffect, StateField, EditorSelection } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { App, Notice } from 'obsidian';
import { DeepseekAPI } from './api';
import { QuickAskAISettings } from './settings';

class InputWidget extends WidgetType {
  private container: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private statusEl: HTMLElement | null = null;
  private allFiles: string[] = [];
  private loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private loadingIndex = 0;
  private loadingInterval: number | null = null;

  constructor(
    private app: App,
    private settings: QuickAskAISettings,
    private selectedText: string,
    private onSubmit: (text: string) => void,
    private onCancel: () => void
  ) {
    super();
    this.loadFiles();
  }

  private loadFiles() {
    const files = this.app.vault.getMarkdownFiles();
    this.allFiles = files.map(f => f.path);
  }

  toDOM(view: EditorView): HTMLElement {
    this.container = document.createElement('div');
    this.container.style.padding = '8px 0';

    const inputContainer = this.container!.createEl('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.gap = '8px';
    inputContainer.style.alignItems = 'flex-start';
    inputContainer.style.position = 'relative';

    this.textarea = inputContainer.createEl('textarea');
    this.textarea.placeholder = '@ 引用 • Enter 发送 • Esc 取消';
    this.textarea.style.flex = '1';
    this.textarea.style.minHeight = '40px';
    this.textarea.style.padding = '8px';
    this.textarea.style.border = '1px solid var(--background-modifier-border)';
    this.textarea.style.borderRadius = '4px';
    this.textarea.style.fontSize = '13px';
    this.textarea.style.fontFamily = 'var(--font-monospace)';
    this.textarea.style.resize = 'none';
    this.textarea.style.backgroundColor = 'var(--background-secondary)';
    this.textarea.style.color = 'var(--text-normal)';

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
        mentionList = inputContainer.createEl('div');
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
        const item = mentionList!.createEl('div', { text: file });
        item.style.padding = '6px 10px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '12px';
        if (i === 0) item.style.background = 'var(--interactive-accent)';
        item.addEventListener('click', () => {
          const cursorPos = this.textarea!.selectionStart;
          const text = this.textarea!.value;
          const beforeAt = text.substring(0, mentionStartIndex);
          const afterCursor = text.substring(cursorPos);
          this.textarea!.value = beforeAt + '@' + file + ' ' + afterCursor;
          mentionList!.style.display = 'none';
          this.textarea!.focus();
        });
      });
    };

    const hideMentionList = () => {
      if (mentionList) mentionList.style.display = 'none';
    };

    this.textarea.addEventListener('input', () => {
      const cursorPos = this.textarea!.selectionStart;
      const text = this.textarea!.value.substring(0, cursorPos);
      const lastAt = text.lastIndexOf('@');

      if (lastAt === -1 || (lastAt > 0 && !/\s/.test(this.textarea!.value[lastAt - 1]))) {
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

    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const prompt = this.textarea!.value.trim();
        if (prompt) {
          const finalPrompt = this.selectedText ? `${prompt}\n\n${this.selectedText}` : prompt;
          this.onSubmit(finalPrompt);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.onCancel();
      }
    });

    sendBtn.addEventListener('click', () => {
      const prompt = this.textarea!.value.trim();
      if (prompt) {
        const finalPrompt = this.selectedText ? `${prompt}\n\n${this.selectedText}` : prompt;
        this.onSubmit(finalPrompt);
      }
    });

    setTimeout(() => this.textarea?.focus(), 0);

    return this.container;
  }

  setLoading(isLoading: boolean) {
    if (!this.statusEl) return;

    if (isLoading) {
      this.statusEl.style.display = 'flex';
      this.loadingIndex = 0;
      this.loadingInterval = window.setInterval(() => {
        if (this.statusEl) {
          this.statusEl.textContent = this.loadingFrames[this.loadingIndex];
          this.loadingIndex = (this.loadingIndex + 1) % this.loadingFrames.length;
        }
      }, 80);
    } else {
      if (this.loadingInterval !== null) {
        window.clearInterval(this.loadingInterval);
        this.loadingInterval = null;
      }
      this.statusEl.style.display = 'none';
      this.statusEl.textContent = '';
    }
  }
}

class LoadingWidget extends WidgetType {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private index = 0;
  private interval: number | null = null;
  private el: HTMLElement | null = null;

  toDOM(): HTMLElement {
    this.el = document.createElement('span');
    this.el.style.color = 'var(--text-accent)';
    this.el.style.fontSize = '14px';
    this.el.style.fontWeight = 'bold';
    this.el.style.marginRight = '4px';
    this.el.textContent = this.frames[0];

    this.interval = window.setInterval(() => {
      if (this.el) {
        this.el.textContent = this.frames[this.index];
        this.index = (this.index + 1) % this.frames.length;
      }
    }, 80);

    return this.el;
  }

  destroy() {
    if (this.interval !== null) {
      window.clearInterval(this.interval);
    }
  }
}

interface SelectionRange {
  from: number;
  to: number;
}

const showInputEffect = StateEffect.define<{
  pos: number;
  app: App;
  settings: QuickAskAISettings;
  selectedText: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  fakeSelections?: SelectionRange[] | null;
  previousCursor?: number | null;
}>();

const hideInputEffect = StateEffect.define<null>();
const showLoadingEffect = StateEffect.define<number>();
const hideLoadingEffect = StateEffect.define<null>();

interface InputState {
  active: boolean;
  pos: number | null;
  widget: InputWidget | null;
  fakeSelections?: SelectionRange[] | null;
  previousCursor?: number | null;
}

interface LoadingState {
  active: boolean;
  pos: number | null;
}

const inputField = StateField.define<InputState>({
  create() {
    return { active: false, pos: null, widget: null, fakeSelections: null, previousCursor: null };
  },
  update(state, tr) {
    let newState = state;

    for (const effect of tr.effects) {
      if (effect.is(showInputEffect)) {
        newState = {
          active: true,
          pos: effect.value.pos,
          widget: new InputWidget(
            effect.value.app,
            effect.value.settings,
            effect.value.selectedText,
            effect.value.onSubmit,
            effect.value.onCancel
          ),
          fakeSelections: effect.value.fakeSelections,
          previousCursor: effect.value.previousCursor,
        };
      } else if (effect.is(hideInputEffect)) {
        // 恢复原始光标位置（如果有）
        if (state.fakeSelections && state.fakeSelections.length > 0) {
          // 如果有选中范围，恢复选中
          const selection = EditorSelection.create(
            state.fakeSelections.map(r => EditorSelection.range(r.from, r.to))
          );
          setTimeout(() => {
            const view = (window as any).editor?.cm || (document.querySelector('.cm-editor') as any)?.__view;
            if (view) view.dispatch({ selection });
          }, 0);
        } else if (state.previousCursor !== null && state.previousCursor !== undefined) {
          // 否则恢复光标位置
          setTimeout(() => {
            const view = (window as any).editor?.cm || (document.querySelector('.cm-editor') as any)?.__view;
            if (view) view.dispatch({ selection: { anchor: state.previousCursor } });
          }, 0);
        }
        newState = { active: false, pos: null, widget: null, fakeSelections: null, previousCursor: null };
      }
    }

    return newState;
  },
});

const loadingField = StateField.define<LoadingState>({
  create() {
    return { active: false, pos: null };
  },
  update(state, tr) {
    let newState = state;

    for (const effect of tr.effects) {
      if (effect.is(showLoadingEffect)) {
        newState = { active: true, pos: effect.value };
      } else if (effect.is(hideLoadingEffect)) {
        newState = { active: false, pos: null };
      }
    }

    return newState;
  },
});

export class InputPlugin {
  decorations: DecorationSet = Decoration.none;

  constructor(private view: EditorView) {
    this.updateDecorations();
  }

  update() {
    this.updateDecorations();
  }

  private updateDecorations() {
    const inputState = this.view.state.field(inputField, false);
    const loadingState = this.view.state.field(loadingField, false);
    const decorations: Array<ReturnType<typeof Decoration.widget | typeof Decoration.mark>> = [];

    // 先添加 fakeSelections 装饰（按范围排序）
    if (inputState?.active && inputState.fakeSelections) {
      const sorted = inputState.fakeSelections.slice().sort((a, b) => a.from - b.from);
      for (const r of sorted) {
        decorations.push(
          Decoration.mark({ class: 'quick-ask-ai-fake-selection' }).range(r.from, r.to)
        );
      }
    }

    // 再添加 widget 装饰（浮动对话框，不占据编辑器空间）
    if (inputState?.active && inputState.pos !== null && inputState.pos <= this.view.state.doc.length && inputState.widget) {
      decorations.push(
        Decoration.widget({
          widget: inputState.widget,
          side: 1,
        }).range(inputState.pos)
      );
    }

    if (loadingState?.active && loadingState.pos !== null && loadingState.pos <= this.view.state.doc.length) {
      decorations.push(
        Decoration.widget({
          widget: new LoadingWidget(),
          side: -1,
        }).range(loadingState.pos)
      );
    }

    if (decorations.length > 0) {
      this.decorations = Decoration.set(decorations);
    } else {
      this.decorations = Decoration.none;
    }
  }
}

export const inputPlugin = ViewPlugin.fromClass(InputPlugin, {
  decorations: (v) => v.decorations,
});

export { showInputEffect, hideInputEffect, showLoadingEffect, hideLoadingEffect, inputField, loadingField };
