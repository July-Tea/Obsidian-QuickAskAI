import { StateEffect, StateField, Prec, Range, ChangeDesc } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, ViewPlugin, keymap } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { App } from 'obsidian';
import { PromptSegment } from './settings';

const CHIP_CLASS = 'quick-ask-ai-mention-chip';
const ZWSP = '\u200B';

export interface InputCallbacks {
  getHistory: () => PromptSegment[][];
  onSubmit: (segments: PromptSegment[]) => void;
  onCancel: () => void;
}

export class InputWidget extends WidgetType {
  private allFiles: string[] = [];
  private currentFilePath: string | null = null;

  constructor(private app: App, private callbacks: InputCallbacks) {
    super();
    this.allFiles = this.app.vault.getMarkdownFiles().map(f => f.path);
    this.currentFilePath = this.app.workspace.getActiveFile()?.path ?? null;
  }

  // 同一个输入框实例始终复用 DOM，避免文档变化时重建导致输入内容丢失
  eq(other: WidgetType): boolean {
    return other === this;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.style.padding = '8px 0';

    const inputContainer = container.createEl('div');
    inputContainer.style.display = 'flex';
    inputContainer.style.gap = '8px';
    inputContainer.style.alignItems = 'flex-start';
    inputContainer.style.position = 'relative';

    const editorEl = inputContainer.createEl('div');
    editorEl.contentEditable = 'true';
    editorEl.dataset.placeholder = '@ 引用 • ↑ 历史 • Enter 发送 • Esc 取消';
    editorEl.className = 'quick-ask-ai-editable';
    editorEl.style.flex = '1';
    editorEl.style.minHeight = '40px';
    editorEl.style.maxHeight = '200px';
    editorEl.style.overflowY = 'auto';
    editorEl.style.padding = '8px';
    editorEl.style.border = '1px solid var(--background-modifier-border)';
    editorEl.style.borderRadius = '4px';
    editorEl.style.fontSize = '13px';
    editorEl.style.fontFamily = 'var(--font-monospace)';
    editorEl.style.backgroundColor = 'var(--background-secondary)';
    editorEl.style.color = 'var(--text-normal)';
    editorEl.style.whiteSpace = 'pre-wrap';
    editorEl.style.wordBreak = 'break-word';

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

      const filtered = this.allFiles.filter(f => f.toLowerCase().includes(query.toLowerCase()));

      // 将当前文件放在第一个，其他文件按字母顺序排序
      currentMatches = filtered.sort((a, b) => {
        if (this.currentFilePath && a === this.currentFilePath) return -1;
        if (this.currentFilePath && b === this.currentFilePath) return 1;
        return a.localeCompare(b, 'zh-CN');
      }).slice(0, 50);

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

    const isChip = (node: Node | null): node is HTMLElement =>
      !!node && node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).classList.contains(CHIP_CLASS);

    const createChip = (path: string): HTMLSpanElement => {
      const chip = document.createElement('span');
      chip.className = CHIP_CLASS;
      chip.contentEditable = 'false';
      chip.textContent = path.split('/').pop() || path;
      chip.dataset.path = path;
      return chip;
    };

    const placeCaret = (node: Node, offset: number) => {
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    };

    // 把输入框内容解析为「文本 + 文件引用」片段，文件引用以 chip 的形式存在
    const getSegments = (): PromptSegment[] => {
      const segments: PromptSegment[] = [];
      let buffer = '';
      const flush = () => {
        if (buffer) segments.push(buffer);
        buffer = '';
      };
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          buffer += (node.textContent || '').split(ZWSP).join('');
        } else if (isChip(node)) {
          flush();
          if (node.dataset.path) segments.push({ path: node.dataset.path });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if ((node as HTMLElement).tagName === 'BR') {
            buffer += '\n';
            return;
          }
          node.childNodes.forEach(walk);
        }
      };
      editorEl.childNodes.forEach(walk);
      flush();
      return segments;
    };

    const setSegments = (segments: PromptSegment[]) => {
      editorEl.empty();
      for (const segment of segments) {
        editorEl.appendChild(
          typeof segment === 'string' ? document.createTextNode(segment) : createChip(segment.path)
        );
      }
      if (!segments.length) {
        // 保持元素为空，以便显示 placeholder
        editorEl.focus();
        return;
      }
      // 末尾补一个零宽字符，保证光标能落在最后一个 chip 之后
      const tail = document.createTextNode(ZWSP);
      editorEl.appendChild(tail);
      placeCaret(tail, tail.length);
    };

    const isEmpty = (segments: PromptSegment[]) =>
      segments.every(s => typeof s === 'string' && !s.trim());

    // 输入历史：只有输入框为空、或内容仍是刚调出的历史时，↑/↓ 才切换历史，
    // 其余情况保留方向键在多行输入中移动光标的默认行为
    let historyIndex = -1;
    let recalledSignature: string | null = null;

    const isBrowsingHistory = () =>
      historyIndex >= 0 && JSON.stringify(getSegments()) === recalledSignature;

    const recallHistory = (direction: -1 | 1): boolean => {
      const history = this.callbacks.getHistory();
      if (direction === -1) {
        if (!(isEmpty(getSegments()) || isBrowsingHistory())) return false;
        const next = historyIndex === -1 ? history.length - 1 : historyIndex - 1;
        if (next < 0) return historyIndex >= 0;
        historyIndex = next;
      } else {
        if (!isBrowsingHistory()) return false;
        historyIndex = historyIndex + 1 < history.length ? historyIndex + 1 : -1;
      }

      hideMentionList();
      if (historyIndex === -1) {
        recalledSignature = null;
        setSegments([]);
      } else {
        setSegments(history[historyIndex]);
        recalledSignature = JSON.stringify(getSegments());
      }
      return true;
    };

    const selectMention = (index: number) => {
      const file = currentMatches[index];
      if (!file || !mentionTextNode) return;

      const text = mentionTextNode.textContent || '';
      const before = text.substring(0, mentionStartOffset);
      const after = text.substring(mentionEndOffset);
      const parent = mentionTextNode.parentNode;
      if (!parent) return;

      const beforeTextNode = document.createTextNode(before);
      const afterTextNode = document.createTextNode(' ' + after);

      parent.insertBefore(beforeTextNode, mentionTextNode);
      parent.insertBefore(createChip(file), mentionTextNode);
      parent.insertBefore(afterTextNode, mentionTextNode);
      parent.removeChild(mentionTextNode);

      placeCaret(afterTextNode, 1);
      hideMentionList();
      editorEl.focus();
    };

    const trySubmit = () => {
      const segments = getSegments();
      if (isEmpty(segments)) return;
      this.callbacks.onSubmit(segments);
    };

    editorEl.addEventListener('input', () => {
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

      if (lastAt === -1 || (lastAt > 0 && !/[\s\u200B]/.test(textBefore[lastAt - 1]))) {
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

    editorEl.addEventListener('keydown', (e) => {
      // 输入法组字过程中的按键（如回车确认候选词）交给输入法处理
      if (e.isComposing) return;

      // 处理 Cmd+A / Ctrl+A：只选中输入框内的内容，不选中文章
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(editorEl);
          sel.addRange(range);
        }
        return;
      }

      // @ 候选列表打开时，方向键/回车/Esc 优先给候选列表用
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

      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        if (recallHistory(e.key === 'ArrowUp' ? -1 : 1)) {
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
          const range = sel.getRangeAt(0);
          const node = range.startContainer;
          // 光标位于 chip 之后的文本开头（或仅隔着零宽字符）时，整体删除 chip
          const beforeCaret = node.nodeType === Node.TEXT_NODE
            ? (node.textContent || '').substring(0, range.startOffset)
            : null;
          if (beforeCaret !== null && beforeCaret.split(ZWSP).join('') === '' && isChip(node.previousSibling)) {
            e.preventDefault();
            node.previousSibling.remove();
            return;
          }
        }
        // 所有其他情况（光标在内容中间、或前面没有 chip），使用默认删除
        return;
      }

      if (e.key === 'Delete') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
          const range = sel.getRangeAt(0);
          const node = range.startContainer;
          const afterCaret = node.nodeType === Node.TEXT_NODE
            ? (node.textContent || '').substring(range.startOffset)
            : null;
          // 仅当光标后面（当前文本节点内）没有实际内容时，才检查删除 chip
          if (afterCaret !== null && afterCaret.split(ZWSP).join('').trim() === '') {
            // 从光标位置往后遍历，跳过纯空白节点，找第一个 chip
            let sibling = node.nextSibling;
            while (sibling && sibling.nodeType === Node.TEXT_NODE && (sibling.textContent || '').split(ZWSP).join('').trim() === '') {
              sibling = sibling.nextSibling;
            }
            if (isChip(sibling)) {
              e.preventDefault();
              sibling.remove();
              return;
            }
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
        this.callbacks.onCancel();
      }
    });

    sendBtn.addEventListener('click', () => {
      trySubmit();
    });

    setTimeout(() => editorEl.focus(), 0);

    return container;
  }
}

// ---------------------------------------------------------------------------
// 生成结果预览：生成内容先以装饰形式展示（不写入文档），确认后才一次性写入
// ---------------------------------------------------------------------------

class PreviewWidget extends WidgetType {
  // status 为 null 时不显示控件（多选区时只在最后一处显示）
  constructor(readonly text: string, readonly status: SessionStatus | null) {
    super();
  }

  eq(other: PreviewWidget): boolean {
    return other.text === this.text && other.status === this.status;
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('span');
    dom.className = 'quick-ask-ai-preview';
    dom.createSpan({ cls: 'quick-ask-ai-preview-text' });
    this.render(dom, view);
    return dom;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    this.render(dom, view);
    return true;
  }

  private render(dom: HTMLElement, view: EditorView) {
    const textEl = dom.firstElementChild as HTMLElement;
    textEl.textContent = this.text;
    textEl.style.display = this.text ? '' : 'none';

    // 控件只在状态变化时重建，避免流式更新时按钮被反复替换导致点击失效
    const key = this.status ?? '';
    if (dom.dataset.controls === key) return;
    dom.dataset.controls = key;
    dom.querySelector('.quick-ask-ai-controls')?.remove();
    if (!this.status) return;

    const controlsEl = dom.createSpan({ cls: 'quick-ask-ai-controls' });
    const addButton = (label: string, cls: string, action: (view: EditorView) => boolean) => {
      const btn = controlsEl.createEl('button', { text: label, cls });
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        action(view);
        view.focus();
      });
    };

    if (this.status === 'generating') {
      controlsEl.createSpan({ cls: 'quick-ask-ai-spinner', text: '●' });
      addButton('停止 Esc', '', stopSession);
    } else {
      addButton('✓ 接受 Tab', 'mod-cta', acceptSession);
      addButton('✗ 拒绝 Esc', '', rejectSession);
    }
  }
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

export interface SelectionRange {
  from: number;
  to: number;
}

export interface InputState {
  pos: number;
  widget: InputWidget;
  // 唤起时的选区（非空范围），无选区时为 null
  selections: SelectionRange[] | null;
  cursor: number;
}

// 一个待替换区域：from/to 为原文范围（无选区时 from === to，即插入点）
export interface Hunk {
  from: number;
  to: number;
  text: string;
}

export type SessionStatus = 'generating' | 'review';

export interface Session {
  id: number;
  status: SessionStatus;
  hunks: Hunk[];
  controller: AbortController;
}

export interface QuickAskState {
  input: InputState | null;
  session: Session | null;
}

export const showInputEffect = StateEffect.define<InputState>();
export const hideInputEffect = StateEffect.define<null>();
export const startSessionEffect = StateEffect.define<Session>();
export const appendTextEffect = StateEffect.define<{ id: number; index: number; text: string }>();
export const reviewSessionEffect = StateEffect.define<number>();
export const endSessionEffect = StateEffect.define<number>();

const mapRange = (r: SelectionRange, changes: ChangeDesc): SelectionRange => {
  const from = changes.mapPos(r.from, 1);
  return { from, to: Math.max(from, changes.mapPos(r.to, -1)) };
};

const updateSession = (session: Session | null, id: number, fn: (s: Session) => Session) =>
  session && session.id === id ? fn(session) : session;

export const quickAskField = StateField.define<QuickAskState>({
  create() {
    return { input: null, session: null };
  },
  update(state, tr) {
    let { input, session } = state;

    // 文档变化时（例如生成过程中用户继续编辑），把记录的位置映射到新文档
    if (tr.docChanged) {
      if (input) {
        input = {
          ...input,
          pos: tr.changes.mapPos(input.pos, 1),
          cursor: tr.changes.mapPos(input.cursor),
          selections: input.selections?.map(r => mapRange(r, tr.changes)) ?? null,
        };
      }
      if (session) {
        session = { ...session, hunks: session.hunks.map(h => ({ ...h, ...mapRange(h, tr.changes) })) };
      }
    }

    for (const effect of tr.effects) {
      if (effect.is(showInputEffect)) {
        input = effect.value;
      } else if (effect.is(hideInputEffect)) {
        input = null;
      } else if (effect.is(startSessionEffect)) {
        session = effect.value;
      } else if (effect.is(appendTextEffect)) {
        const { id, index, text } = effect.value;
        session = updateSession(session, id, s => ({
          ...s,
          hunks: s.hunks.map((h, i) => (i === index ? { ...h, text: h.text + text } : h)),
        }));
      } else if (effect.is(reviewSessionEffect)) {
        session = updateSession(session, effect.value, s => ({ ...s, status: 'review' }));
      } else if (effect.is(endSessionEffect)) {
        session = updateSession(session, effect.value, () => null);
      }
    }

    return input === state.input && session === state.session ? state : { input, session };
  },
  provide: field => EditorView.decorations.from(field, buildDecorations),
});

function buildDecorations(state: QuickAskState): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  if (state.input) {
    for (const r of state.input.selections ?? []) {
      if (r.from < r.to) {
        decorations.push(Decoration.mark({ class: 'quick-ask-ai-fake-selection' }).range(r.from, r.to));
      }
    }
    decorations.push(Decoration.widget({ widget: state.input.widget, side: 1 }).range(state.input.pos));
  }

  const session = state.session;
  if (session) {
    const lastIndex = session.hunks.length - 1;
    session.hunks.forEach((h, i) => {
      if (h.from < h.to) {
        decorations.push(Decoration.mark({ class: 'quick-ask-ai-original' }).range(h.from, h.to));
      }
      const status = i === lastIndex ? session.status : null;
      if (h.text || status) {
        decorations.push(Decoration.widget({ widget: new PreviewWidget(h.text, status), side: 1 }).range(h.to));
      }
    });
  }

  return Decoration.set(decorations, true);
}

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

const getSession = (view: EditorView) => view.state.field(quickAskField, false)?.session ?? null;

// 接受：把所有生成结果作为一次编辑写入文档（只占一个撤销步骤）
export function acceptSession(view: EditorView): boolean {
  const session = getSession(view);
  if (!session || session.status !== 'review') return false;

  const hunks = session.hunks.filter(h => h.text);
  const changes = view.state.changes(hunks.map(h => ({ from: h.from, to: h.to, insert: h.text })));
  const last = hunks[hunks.length - 1];
  view.dispatch({
    changes,
    selection: last ? { anchor: changes.mapPos(last.to, 1) } : undefined,
    effects: endSessionEffect.of(session.id),
    // 不使用 input.type 类事件，避免被合并进相邻的撤销步骤
    userEvent: 'input.quick-ask-ai',
    scrollIntoView: true,
  });
  return true;
}

export function rejectSession(view: EditorView): boolean {
  const session = getSession(view);
  if (!session) return false;
  session.controller.abort();
  view.dispatch({ effects: endSessionEffect.of(session.id) });
  return true;
}

// 停止生成：中止请求，已生成的部分进入预览，可继续接受/拒绝
export function stopSession(view: EditorView): boolean {
  const session = getSession(view);
  if (!session || session.status !== 'generating') return false;
  session.controller.abort();
  return true;
}

const sessionKeymap = Prec.highest(keymap.of([
  { key: 'Tab', run: acceptSession },
  {
    key: 'Escape',
    run: (view) => {
      const session = getSession(view);
      if (!session) return false;
      return session.status === 'generating' ? stopSession(view) : rejectSession(view);
    },
  },
]));

// 编辑器被关闭或切换文件时，中止仍在进行的请求
const sessionCleanup = ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) {}
  destroy() {
    getSession(this.view)?.controller.abort();
  }
});

export const quickAskExtensions = [quickAskField, sessionKeymap, sessionCleanup];
