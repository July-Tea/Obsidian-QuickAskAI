# Quick Ask AI

在 Obsidian 中直接集成 AI（默认 Deepseek，支持任意 OpenAI 兼容接口），随时随地快速提问。

## 功能

- 🚀 **快速提问**：Ctrl+P 调起内联对话框
- 📝 **选中文本**：自动包含选中内容到提问
- 📂 **文件引用**：`@filename.md` 语法引用文件
- 💬 **流式预览**：AI 结果先以预览形式显示，确认后才写入笔记（一次 Cmd+Z 即可撤销）
- 🕘 **输入历史**：输入框中按 ↑/↓ 调出之前的提问
- ⏱️ **超时保护**：可配置的请求超时

## 快速开始

1. 获取 [Deepseek API Key](https://platform.deepseek.com/api_keys)
2. 在 Obsidian 设置中配置 API Key 和模型
3. Ctrl+P 搜索 "Quick Ask AI"
4. 输入提问，Enter 发送

## 配置

先在 **Provider** 下拉框选择服务商，下方会显示对应的配置项。

**Deepseek**

| 选项 | 说明 |
|------|------|
| API Key | Deepseek API 密钥 |
| Model | 模型名称（如 `deepseek-chat`、`deepseek-flash`） |
| Enable Thinking | 是否开启思考模式；关闭时会显式禁用思考 |
| Thinking Level | 思考强度：Low / High / Max |
| Custom Parameters | 自定义请求参数（JSON） |

**OpenAI 兼容**（OpenAI、OpenRouter、硅基流动、Ollama 等）

| 选项 | 说明 |
|------|------|
| Base URL | 接口地址，如 `https://api.openai.com/v1`，请求发往 `{Base URL}/chat/completions` |
| API Key | API 密钥（本地服务可留空） |
| Model | 模型名称 |
| Custom Parameters | 自定义请求参数（JSON） |

**通用**

| 选项 | 说明 |
|------|------|
| System Prompt | 自定义系统提示词 |
| Timeout | 首次响应超时（秒） |

Custom Parameters 是一个 JSON 对象，会合并进请求体，可以覆盖默认参数，例如：

```json
{
  "temperature": 0.7,
  "max_tokens": 2000,
  "reasoning_effort": "low"
}
```

`messages` 和 `stream` 由插件控制，不能覆盖。

## 快捷键

- `Enter` - 发送提问
- `Shift+Enter` - 换行
- `Esc` - 取消
- `@` - 引用文件（候选列表中 ↑/↓ 选择，Enter/Tab 确认）
- `↑` / `↓` - 输入框为空时切换历史提问

生成过程中 / 生成完成后：

- `Esc` - 生成中停止（已生成部分可继续接受）；生成完成后拒绝
- `Tab` - 接受结果并写入笔记

## 开发

```bash
npm install
npm run build
```

安装时需要把 `main.js`、`manifest.json`、`styles.css` 复制到 `.obsidian/plugins/quick-ask-ai/`。
