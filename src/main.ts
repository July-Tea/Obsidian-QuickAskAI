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

          // 对话框显示位置：如果有选中，显示在最后一个选中范围末尾；否则显示在光标处
          const cursorPos = view.state.selection.main.head;
          const insertPos = fakeSelections && fakeSelections.length > 0
            ? fakeSelections[fakeSelections.length - 1].to
            : cursorPos;

          view.dispatch({
            effects: showInputEffect.of({
              pos: insertPos,
              app: this.app,
              settings: this.settings,
              selectedText: selection,
              fakeSelections,
              previousCursor: fakeSelections && fakeSelections.length > 0 ? fakeSelections[0].from : cursorPos,
              onSubmit: async (prompt: string) => {
                if (!prompt.trim()) return;
                if (!plugin.settings.apiKey) return;

                view.dispatch({ effects: hideInputEffect.of(null) });
                let allText = '';
                let isFirstChunk = true;
                let timeoutId: number | null = null;
                let hasReceived = false;
                const cursor = editor.getCursor();

                view.dispatch({ effects: showLoadingEffect.of(insertPos) });

                try {
                  const fileRegex = /@[\w\/.-]+\.md/g;
                  const fileMatches = prompt.match(fileRegex) || [];
                  let finalPrompt = prompt;

                  for (const fileMatch of fileMatches) {
                    const filePath = fileMatch.substring(1);
                    try {
                      const file = plugin.app.vault.getAbstractFileByPath(filePath);
                      if (file && file.path) {
                        const content = await plugin.app.vault.read(file as any);
                        finalPrompt = finalPrompt.replace(fileMatch, `\n\`\`\`\n${content}\n\`\`\``);
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
