import { Editor, Notice, Plugin, TFile } from 'obsidian';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { QuickAskAISettings, QuickAskAISettingTab, MAX_PROMPT_HISTORY, PromptSegment, migrateSettings } from './settings';
import { ChatAPI, buildRequest } from './api';
import {
  quickAskExtensions, quickAskField, InputWidget, Session, SelectionRange,
  showInputEffect, hideInputEffect, startSessionEffect, appendTextEffect,
  reviewSessionEffect, endSessionEffect,
} from './inputPlugin';

export default class QuickAskAI extends Plugin {
  settings: QuickAskAISettings;
  private sessionCounter = 0;

  async onload() {
    try {
      await this.loadSettings();

      this.addSettingTab(new QuickAskAISettingTab(this.app, this));

      this.registerEditorExtension(quickAskExtensions);

      this.addCommand({
        id: 'quick-ask-ai',
        name: 'Quick Ask AI',
        editorCallback: (editor) => this.openInput(editor),
      });
    } catch (error) {
      console.error('Error loading Quick Ask AI plugin:', error);
    }
  }

  private openInput(editor: Editor) {
    const view = (editor as any).cm as EditorView | undefined;
    if (!view) return;

    const state = view.state.field(quickAskField, false);
    if (!state) return;
    if (state.session) {
      new Notice('请先接受（Tab）或拒绝（Esc）当前的 AI 结果');
      return;
    }

    // 从 CodeMirror view 直接获取 selection ranges（绝对位置）
    const nonEmpty = view.state.selection.ranges
      .filter(r => !r.empty)
      .map(r => ({ from: r.from, to: r.to }));
    const selections = nonEmpty.length ? nonEmpty : null;

    // 对话框显示位置：如果有选中，显示在选中范围最后一行的行末；否则显示在光标所在行的行末
    const cursor = view.state.selection.main.head;
    const basePos = selections ? selections[selections.length - 1].to : cursor;
    const pos = view.state.doc.lineAt(basePos).to;

    const widget = new InputWidget(this.app, {
      getHistory: () => this.settings.promptHistory,
      onSubmit: (segments) => this.submit(view, segments),
      onCancel: () => this.closeInput(view),
    });

    view.dispatch({ effects: showInputEffect.of({ pos, widget, selections, cursor }) });
  }

  // 关闭输入框，并恢复唤起前的选区/光标
  private closeInput(view: EditorView): { selections: SelectionRange[] | null; cursor: number } | null {
    const input = view.state.field(quickAskField, false)?.input;
    if (!input) return null;
    const ranges = input.selections ?? [{ from: input.cursor, to: input.cursor }];
    view.dispatch({
      effects: hideInputEffect.of(null),
      selection: EditorSelection.create(ranges.map(r => EditorSelection.range(r.from, r.to))),
    });
    view.focus();
    return { selections: input.selections, cursor: input.cursor };
  }

  private async submit(view: EditorView, segments: PromptSegment[]) {
    // 配置不完整（缺 API Key、自定义参数格式错误等）时保留输入框，方便改完设置后重新发送
    try {
      buildRequest(this.settings, []);
    } catch (e) {
      new Notice(e instanceof Error ? e.message : String(e));
      return;
    }

    this.addToHistory(segments);

    const closed = this.closeInput(view);
    if (!closed) return;

    // 每个选区对应一个待替换区域；无选区时在光标处插入
    const ranges = closed.selections ?? [{ from: closed.cursor, to: closed.cursor }];
    const session: Session = {
      id: ++this.sessionCounter,
      status: 'generating',
      hunks: ranges.map(r => ({ from: r.from, to: r.to, text: '' })),
      controller: new AbortController(),
    };
    view.dispatch({ effects: startSessionEffect.of(session) });

    // 在任何异步操作之前读取选中内容，此时位置一定与文档一致
    const selectedTexts = ranges.map(r => view.state.sliceDoc(r.from, r.to));

    const isActive = () => view.state.field(quickAskField, false)?.session?.id === session.id;

    const signal = session.controller.signal;
    let timedOut = false;
    let error: unknown = null;
    let receivedAny = false;

    const timeoutId = window.setTimeout(() => {
      if (!receivedAny) {
        timedOut = true;
        session.controller.abort();
      }
    }, this.settings.timeout * 1000);

    try {
      const references = await this.readReferences(segments);
      const api = new ChatAPI(this.settings);

      await Promise.all(selectedTexts.map(async (selectedText, index) => {
        const userMessage = buildUserMessage(segments, references, selectedText);

        for await (const delta of api.chatStream(userMessage, signal)) {
          // 思考内容也算已开始响应（不触发首包超时），但不写进笔记
          receivedAny = true;
          if (!isActive()) return;
          if (delta.kind === 'content') {
            view.dispatch({ effects: appendTextEffect.of({ id: session.id, index, text: delta.text }) });
          }
        }
      }));
    } catch (e) {
      if (!signal.aborted) {
        error = e;
        // 一个选区失败时中止其余请求
        session.controller.abort();
      }
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (timedOut) {
      new Notice('Request timeout');
    } else if (error) {
      console.error('Quick Ask AI error:', error);
      new Notice(`Quick Ask AI 出错：${error instanceof Error ? error.message : String(error)}`);
    }

    if (!isActive()) return;
    const hasText = view.state.field(quickAskField).session!.hunks.some(h => h.text);
    view.dispatch({
      effects: hasText ? reviewSessionEffect.of(session.id) : endSessionEffect.of(session.id),
    });
  }

  private async readReferences(segments: PromptSegment[]): Promise<Array<{ path: string; content: string }>> {
    // 通过 @ 候选列表选择的文件
    const chipPaths = new Set<string>();
    // 兜底：兼容手动输入但未通过下拉选择的 @file.md 引用（使用 Unicode 安全的正则）
    const typedPaths = new Set<string>();
    for (const segment of segments) {
      if (typeof segment !== 'string') {
        chipPaths.add(segment.path);
      } else {
        for (const match of segment.matchAll(/@([^\s@]+\.md)/gu)) {
          typedPaths.add(match[1]);
        }
      }
    }

    const references: Array<{ path: string; content: string }> = [];
    for (const path of new Set([...chipPaths, ...typedPaths])) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        if (chipPaths.has(path)) new Notice(`引用的文件不存在：${path}`);
        continue;
      }
      references.push({ path, content: await this.app.vault.read(file) });
    }
    return references;
  }

  private addToHistory(segments: PromptSegment[]) {
    const history = this.settings.promptHistory;
    const last = history[history.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(segments)) return;
    history.push(segments);
    if (history.length > MAX_PROMPT_HISTORY) {
      history.splice(0, history.length - MAX_PROMPT_HISTORY);
    }
    this.saveSettings();
  }

  async loadSettings() {
    this.settings = migrateSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// 用 XML 标签把用户指令、引用文件和选中内容分隔开，避免模型混淆
function buildUserMessage(
  segments: PromptSegment[],
  references: Array<{ path: string; content: string }>,
  selectedText: string
): string {
  const instruction = segments
    .map(s => (typeof s === 'string' ? s : `@${s.path}`))
    .join('')
    .trim();

  // 没有选中内容和引用文件时，直接发送用户输入
  if (!selectedText && !references.length) return instruction;

  const parts: string[] = [];
  if (selectedText) {
    parts.push(
      '<instruction> 是我的要求，<selected_text> 是我在笔记中选中的内容。' +
      '请按要求处理选中内容，你的回复会直接替换笔记中的选中内容。'
    );
  }
  if (instruction) {
    parts.push(`<instruction>\n${instruction}\n</instruction>`);
  }
  if (references.length) {
    const files = references
      .map(r => `<file path="${r.path}">\n${r.content}\n</file>`)
      .join('\n');
    parts.push(`<referenced_files>\n${files}\n</referenced_files>`);
  }
  if (selectedText) {
    parts.push(`<selected_text>\n${selectedText}\n</selected_text>`);
  }
  return parts.join('\n\n');
}
