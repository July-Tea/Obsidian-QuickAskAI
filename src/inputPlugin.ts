import { StateEffect, StateField, EditorSelection } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { App, Notice } from 'obsidian';
import { DeepseekAPI } from './api';
import { QuickAskAISettings } from './settings';

class InputWidget extends WidgetType {
  private container: HTMLElement | null = null;
  private editorEl: HTMLDivElement | null = null;
  private statusEl: HTMLElement | null = null;
  private allFiles: string[] = [];
  private loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private loadingIndex = 0;
  private loadingInterval: number | null = null;

  constructor(
    private app: App,
    private settings: QuickAskAISettings,
    private selectedText: string,
    private onSubmit: (text: string, filePaths: string[]) => void,
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

    this.editorEl = inputContainer.createEl('div');
    this.editorEl.contentEditable = 'true';
    this.editorEl.dataset.placeholder = '@ 引用 • Enter 发送 • Esc 取消';
    this.editorEl.className = 'quick-ask-ai-editable';
    this.editorEl.style.flex = '1';
    this.editorEl.style.minHeight = '40px';
    this.editorEl.style.maxHeight = '200px';
    this.editorEl.style.overflowY = 'auto';
    this.editorEl.style.padding = '8px';
    this.editorEl.style.border = '1px solid var(--background-modifier-border)';
    this.editorEl.style.borderRadius = '4px';
    this.editorEl.style.fontSize = '13px';
    this.editorEl.style.fontFamily = 'var(--font-monospace)';
    this.editorEl.style.backgroundColor = 'var(--background-secondary)';
    this.editorEl.style.color = 'var(--text-normal)';
    this.editorEl.style.whiteSpace = 'pre-wrap';
    this.editorEl.style.wordBreak = 'break-word';

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

    // 已选中的文件引用（路径记录，用于读取内容；显示以内联 chip 形式嵌入输入框内）
    let selectedFiles: Array<{ path: string; basename: string }> = [];

    let mentionList: HTMLDivElement | null = null;
    let mentionItems: HTMLDivElement[] = [];
    let mentionTextNode: Text | null = null;
    let mentionStartOffset = -1;
    let mentionEndOffset = -1;
    let currentMatches: string[] = [];
    let highlightedIndex = 0;

    // 仅更新高亮样式，不重建 DOM —— 避免鼠标 hover/滚动触发的 mouseenter
    // 和重建逻辑打架，导致候选项在鼠标按下的瞬间被替换掉而点击失效
    const applyHighlight = (scrollIntoView: boolean) => {
      mentionItems.forEach((item, i) => {
        if (i === highlightedIndex) {
          item.style.background = 'var(--interactive-accent)';
          item.style.color = 'white';
          if (scrollIntoView) item.scrollIntoView({ block: 'nearest' });
        } else {
          item.style.background = '';
          item.style.color = '';
        }
      });
    };

    // 仅在候选文件集合变化（用户输入过滤词）时才重建 DOM
    const renderMentionList = () => {
      if (!mentionList) return;
      mentionList.empty();
      mentionItems = [];

      if (currentMatches.length === 0) {
        mentionList.style.display = 'none';
        return;
      }

      mentionList.style.display = 'block';
      currentMatches.forEach((file, i) => {
        const item = mentionList!.createEl('div', { text: file });
        item.style.padding = '6px 10px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '12px';
        item.addEventListener('mouseenter', () => {
          highlightedIndex = i;
          applyHighlight(false);
        });
        item.addEventListener('mousedown', (e) => {
          // 用 mousedown 而非 click，避免 editorEl 失焦导致 mentionList 提前隐藏
          e.preventDefault();
          selectMention(i);
        });
        mentionItems.push(item);
      });
      applyHighlight(false);
    };

    const showMentionList = (query: string) => {
      if (!mentionList) {
        mentionList = inputContainer.createEl('div');
        mentionList.style.position = 'absolute';
        mentionList.style.top = '44px';
        mentionList.style.left = '0';
        mentionList.style.background = 'var(--background-secondary)';
        mentionList.style.border = '1px solid var(--background-modifier-border)';
        mentionList.style.borderRadius = '4px';
        mentionList.style.maxHeight = '200px';
        mentionList.style.overflowY = 'auto';
        mentionList.style.minWidth = '280px';
        mentionList.style.zIndex = '1000';
      }

      currentMatches = this.allFiles
        .filter(f => f.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 50);
      highlightedIndex = 0;
      renderMentionList();
    };

    const isMentionListOpen = () =>
      !!mentionList && mentionList.style.display !== 'none' && currentMatches.length > 0;

    const hideMentionList = () => {
      if (mentionList) mentionList.style.display = 'none';
      currentMatches = [];
      mentionItems = [];
      mentionTextNode = null;
    };

    // 从输入框（contenteditable）中提取纯文本内容，跳过文件引用 chip 本身
    const getPromptText = (): string => {
      let text = '';
      const walk = (node: ChildNode) => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.classList.contains('quick-ask-ai-mention-chip')) {
            return;
          }
          if (el.tagName === 'BR') {
            text += '\n';
            return;
          }
          el.childNodes.forEach(walk);
        }
      };
      this.editorEl!.childNodes.forEach(walk);
      return text;
    };

    const selectMention = (index: number) => {
      const file = currentMatches[index];
      if (!file || !mentionTextNode) return;

      const basename = file.split('/').pop() || file;
      const text = mentionTextNode.textContent || '';
      const before = text.substring(0, mentionStartOffset);
      const after = text.substring(mentionEndOffset);
      const parent = mentionTextNode.parentNode;
      if (!parent) return;

      const chip = document.createElement('span');
      chip.className = 'quick-ask-ai-mention-chip';
      chip.contentEditable = 'false';
      chip.textContent = basename;
      chip.dataset.path = file;

      const beforeTextNode = document.createTextNode(before);
      const spaceTextNode = document.createTextNode(' ');
      const afterTextNode = document.createTextNode(after || '​');

      parent.insertBefore(beforeTextNode, mentionTextNode);
      parent.insertBefore(chip, mentionTextNode);
      parent.insertBefore(spaceTextNode, mentionTextNode);
      parent.insertBefore(afterTextNode, mentionTextNode);
      parent.removeChild(mentionTextNode);

      const sel = window.getSelection();
      if (sel) {
        const newRange = document.createRange();
        newRange.setStart(afterTextNode, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      if (!selectedFiles.some(f => f.path === file)) {
        selectedFiles.push({ path: file, basename });
      }

      hideMentionList();
      this.editorEl!.focus();
    };

    const trySubmit = () => {
      const prompt = getPromptText().trim();
      if (!prompt && selectedFiles.length === 0) return;
      const finalPrompt = this.selectedText ? `${prompt}\n\n${this.selectedText}` : prompt;
      this.onSubmit(finalPrompt, selectedFiles.map(f => f.path));
    };

    this.editorEl.addEventListener('input', () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        hideMentionList();
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) {
        hideMentionList();
        return;
      }
      const fullText = node.textContent || '';
      const textBefore = fullText.substring(0, range.startOffset);
      const lastAt = textBefore.lastIndexOf('@');

      if (lastAt === -1 || (lastAt > 0 && !/\s/.test(textBefore[lastAt - 1]))) {
        hideMentionList();
        return;
      }

      const afterAt = textBefore.substring(lastAt + 1);
      if (/\s/.test(afterAt)) {
        hideMentionList();
        return;
      }

      mentionTextNode = node as Text;
      mentionStartOffset = lastAt;
      mentionEndOffset = range.startOffset;
      showMentionList(afterAt);
    });

    this.editorEl.addEventListener('keydown', (e) => {
      if (isMentionListOpen()) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          highlightedIndex = (highlightedIndex + 1) % currentMatches.length;
          applyHighlight(true);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          highlightedIndex = (highlightedIndex - 1 + currentMatches.length) % currentMatches.length;
          applyHighlight(true);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          selectMention(highlightedIndex);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          hideMentionList();
          return;
        }
      }

      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const node = range.startContainer;
          const offset = range.startOffset;

          // 仅当光标在节点最前端（offset === 0）时，才检查删除 chip
          if (node.nodeType === Node.TEXT_NODE && offset === 0) {
            if (!node.parentNode) return;
            const prev = node.previousSibling;

            // 前一个兄弟是 chip，删除 chip
            if (prev && prev.nodeType === Node.ELEMENT_NODE &&
                (prev as HTMLElement).classList.contains('quick-ask-ai-mention-chip')) {
              e.preventDefault();
              const chip = prev as HTMLElement;
              chip.remove();
              const path = chip.dataset.path;
              if (path) {
                selectedFiles = selectedFiles.filter(f => f.path !== path);
              }
              return;
            }
          }
        }
        // 所有其他情况（光标在内容中间、或前面没有 chip），使用默认删除
        return;
      }

      if (e.key === 'Delete') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const node = range.startContainer;

          // 获取当前节点在父级中的位置
          if (!node.parentNode) return;
          const siblings = Array.from(node.parentNode.childNodes);
          let currentIndex = siblings.indexOf(node);

          // 从光标位置往后遍历，跳过纯空白节点，找第一个 chip
          let chipToDelete: HTMLElement | null = null;
          for (let i = currentIndex + 1; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling.nodeType === Node.ELEMENT_NODE) {
              const el = sibling as HTMLElement;
              if (el.classList.contains('quick-ask-ai-mention-chip')) {
                chipToDelete = el;
                break;
              }
              // 遇到非 chip 的元素，停止往后找
              break;
            } else if (sibling.nodeType === Node.TEXT_NODE) {
              const text = sibling.textContent || '';
              // 如果是纯空白，继续往后找
              if (text.trim() === '') continue;
              // 遇到非空白文本，停止往后找
              break;
            }
          }

          if (chipToDelete) {
            e.preventDefault();
            chipToDelete.remove();
            const path = chipToDelete.dataset.path;
            if (path) {
              selectedFiles = selectedFiles.filter(f => f.path !== path);
            }
            return;
          }
        }
        // 非 chip 删除，使用默认行为
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        trySubmit();
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.onCancel();
      }
    });

    sendBtn.addEventListener('click', () => {
      trySubmit();
    });

    setTimeout(() => this.editorEl?.focus(), 0);

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
  onSubmit: (text: string, filePaths: string[]) => void;
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
