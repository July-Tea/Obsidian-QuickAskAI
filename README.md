# Quick Ask AI

一个 Obsidian 插件，集成 Deepseek AI 直接在笔记中提问和回复。

## 功能

- **快速提问**：Ctrl+P 搜索 "Quick Ask AI" 即可调起输入框
- **内联编辑**：在光标位置弹出输入框，无需打开新窗口
- **文件引用**：使用 `@filename.md` 引用 vault 中的文件
- **自动完成**：输入 `@` 显示文件列表
- **灵活配置**：
  - API Key（支持显示/隐藏切换）
  - 自定义模型名称
  - 思考模式（可选）
  - 系统提示词

## 快速开始

1. 在 Obsidian 设置中找到 "Quick Ask AI"
2. 配置您的 Deepseek API Key
3. 输入模型名称（如 `deepseek-chat`）
4. 在笔记中按 Ctrl+P，搜索 "Quick Ask AI"
5. 输入提问，按 Enter 发送

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+P | 打开命令面板 |
| Enter | 发送提问 |
| Shift+Enter | 换行 |
| Esc | 取消 |
| @ | 引用文件 |

## 设置说明

### API Key
- 默认隐藏显示为密码框
- 点击右侧 👁️ 按钮可以切换显示/隐藏

### Model
- 输入框方式，支持自定义模型名称
- 例：`deepseek-chat`、`deepseek-reasoner`

### 使用示例

```
基于 @notes.md 的内容，总结要点
@report.md 中提到了什么关键数据？
```

## 开发

```bash
npm install
npm run dev    # 开发模式
npm run build  # 构建
```
