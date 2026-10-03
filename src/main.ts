import { Plugin } from 'obsidian';
import { QuickAskAISettings, QuickAskAISettingTab, DEFAULT_SETTINGS } from './settings';
import { STYLES_CSS } from './styles';
import { DeepseekAPI } from './api';
import { inputPlugin, showInputEffect, hideInputEffect, showLoadingEffect, hideLoadingEffect, inputField, loadingField } from './inputPlugin';

export default class QuickAskAI extends Plugin {
  settings: QuickAskAISettings;

  async onload() {
    try {
      await this.loadSettings();

      const styleEl = document.createElement('style');
      styleEl.textContent = STYLES_CSS;
      document.head.appendChild(styleEl);

      this.addSettingTab(new QuickAskAISettingTab(this.app, this));

      this.registerEditorExtension(inputField);
      this.registerEditorExtension(loadingField);
      this.registerEditorExtension(inputPlugin);

      this.addCommand({
        id: 'quick-ask-ai',
        name: 'Quick Ask AI',
        editorCallback: (editor) => {
          const view = (editor as any).cm;
          if (!view) return;

          const api = new DeepseekAPI(this.settings);
          const plugin = this;
          const selection = editor.getSelection();

          // 从 CodeMirror view 直接获取 selection ranges（绝对位置）
          const rangesAll = view.state.selection.ranges.map((r: any) => ({
            from: r.from,
            to: r.to,
          }));
          const nonEmpty = rangesAll.filter((r: any) => r.from !== r.to);
          const fakeSelections = nonEmpty.length ? nonEmpty : null;

          // 对话框显示位置：如果有选中，显示在选中范围最后一行的行末；否则显示在光标所在行的行末
          const cursorPos = view.state.selection.main.head;
          const basePos = fakeSelections && fakeSelections.length > 0
            ? fakeSelections[fakeSelections.length - 1].to
            : cursorPos;
          // 取该位置所在行的行末（换行符之前），避免把对话框插入到行中间
          const insertPos = view.state.doc.lineAt(basePos).to;

          view.dispatch({
            effects: showInputEffect.of({
              pos: insertPos,
              app: this.app,
              settings: this.settings,
              selectedText: selection,
              fakeSelections,
              previousCursor: fakeSelections && fakeSelections.length > 0 ? fakeSelections[0].from : cursorPos,
              onSubmit: async (prompt: string, filePaths: string[]) => {
                if (!prompt.trim() && filePaths.length === 0) return;
                if (!plugin.settings.apiKey) return;

                view.dispatch({ effects: hideInputEffect.of(null) });
                let allText = '';
                let isFirstChunk = true;
                let timeoutId: number | null = null;
                let hasReceived = false;
                const cursor = editor.getCursor();

                view.dispatch({ effects: showLoadingEffect.of(insertPos) });

                try {
                  let finalPrompt = prompt;
                  const injectedPaths = new Set<string>();

                  // 优先使用用户从 @ 候选列表中明确选择的文件（支持任意文件名，包括中文）
                  for (const filePath of filePaths) {
                    if (injectedPaths.has(filePath)) continue;
                    try {
                      const file = plugin.app.vault.getAbstractFileByPath(filePath);
                      if (file && (file as any).path) {
                        const content = await plugin.app.vault.read(file as any);
                        finalPrompt += `\n\n--- 引用文件: ${filePath} ---\n${content}`;
                        injectedPaths.add(filePath);
                      }
                    } catch (error) {
                      console.error(`Failed to read file ${filePath}:`, error);
                    }
                  }

                  // 兜底：兼容手动输入但未通过下拉选择的 @file.md 引用（使用 Unicode 安全的正则）
                  const fileRegex = /@([^\s@]+\.md)/gu;
                  const fileMatches = prompt.match(fileRegex) || [];

                  for (const fileMatch of fileMatches) {
                    const filePath = fileMatch.substring(1);
                    if (injectedPaths.has(filePath)) continue;
                    try {
                      const file = plugin.app.vault.getAbstractFileByPath(filePath);
                      if (file && (file as any).path) {
                        const content = await plugin.app.vault.read(file as any);
                        finalPrompt += `\n\n--- 引用文件: ${filePath} ---\n${content}`;
                        injectedPaths.add(filePath);
                      }
                    } catch (error) {
                      console.error(`Failed to read file ${filePath}:`, error);
                    }
                  }

                  timeoutId = window.setTimeout(() => {
                    if (!hasReceived) {
                      view.dispatch({ effects: hideLoadingEffect.of(null) });
                      new (require('obsidian')).Notice('Request timeout');
                    }
                  }, plugin.settings.timeout * 1000);

                  let lastInsertEnd = cursor;

                  for await (const chunk of api.chatStream(finalPrompt)) {
                    if (!hasReceived) {
                      hasReceived = true;
                      if (timeoutId !== null) {
                        window.clearTimeout(timeoutId);
                      }
                      view.dispatch({ effects: hideLoadingEffect.of(null) });
                    }

                    if (isFirstChunk) {
                      if (selection) {
                        editor.replaceSelection(chunk);
                      } else {
                        editor.replaceRange(chunk, cursor);
                      }
                      isFirstChunk = false;
                      const lines = chunk.split('\n');
                      if (lines.length > 1) {
                        lastInsertEnd = { line: cursor.line + lines.length - 1, ch: lines[lines.length - 1].length };
                      } else {
                        lastInsertEnd = { line: cursor.line, ch: cursor.ch + chunk.length };
                      }
                    } else {
                      editor.replaceRange(chunk, lastInsertEnd);
                      const lines = chunk.split('\n');
                      if (lines.length > 1) {
                        lastInsertEnd = { line: lastInsertEnd.line + lines.length - 1, ch: lines[lines.length - 1].length };
                      } else {
                        lastInsertEnd = { line: lastInsertEnd.line, ch: lastInsertEnd.ch + chunk.length };
                      }
                    }
                  }

                  if (!hasReceived) {
                    view.dispatch({ effects: hideLoadingEffect.of(null) });
                  }
                } catch (error) {
                  if (timeoutId !== null) {
                    window.clearTimeout(timeoutId);
                  }
                  view.dispatch({ effects: hideLoadingEffect.of(null) });
                  console.error('Error:', error);
                }
              },
              onCancel: () => {
                view.dispatch({ effects: hideInputEffect.of(null) });
              },
            }),
          });
        },
      });
    } catch (error) {
      console.error('Error loading Quick Ask AI plugin:', error);
    }
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
