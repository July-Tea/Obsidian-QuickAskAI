# Quick Ask AI

在 Obsidian 中直接集成 Deepseek AI，随时随地快速提问。

## 功能

- 🚀 **快速提问**：Ctrl+P 调起内联对话框
- 📝 **选中文本**：自动包含选中内容到提问
- 📂 **文件引用**：`@filename.md` 语法引用文件
- 💬 **流式输出**：实时显示 AI 回复
- ⏱️ **超时保护**：可配置的请求超时

## 快速开始

1. 获取 [Deepseek API Key](https://platform.deepseek.com/api_keys)
2. 在 Obsidian 设置中配置 API Key 和模型
3. Ctrl+P 搜索 "Quick Ask AI"
4. 输入提问，Enter 发送

## 配置

| 选项 | 说明 |
|------|------|
| API Key | Deepseek API 密钥 |
| Model | 模型名称（如 `deepseek-chat`） |
| Enable Thinking | 启用推理模式 |
| System Prompt | 自定义系统提示词 |
| Timeout | 请求超时（秒） |

## 快捷键

- `Enter` - 发送提问
- `Shift+Enter` - 换行
- `Esc` - 取消
- `@` - 引用文件

## 开发

```bash
npm install
npm run build
```
