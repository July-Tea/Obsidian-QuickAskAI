# Quick Ask AI 插件安装指南

## 前置要求

1. Obsidian 桌面应用（v0.15.0 或更高）
2. Deepseek API Key（从 https://platform.deepseek.com 获取）

## 安装步骤

### 方法 1：手动安装（推荐用于开发）

1. **克隆或复制项目文件**到您的 Obsidian vault 的插件文件夹：
   ```
   ~/.obsidian/plugins/quick-ask-ai/
   ```

2. **复制以下文件**到插件文件夹：
   - `main.js` - 插件的编译版本
   - `manifest.json` - 插件元数据

3. **重启 Obsidian** 或在设置中禁用并重新启用插件

### 方法 2：开发模式

如果你想修改代码：

```bash
# 安装依赖
npm install

# 开发模式（实时编译）
npm run dev

# 在另一个终端中，构建生产版本
npm run build
```

## 初始配置

1. 打开 Obsidian 设置
2. 导航到 **社区插件** → **已安装插件**
3. 找到 **Quick Ask AI** 并点击选项按钮
4. 配置以下项目：
   - **API Key**：输入你的 Deepseek API Key
   - **Model**：选择一个模型（推荐 `deepseek-chat`）
   - **Enable Thinking Mode**：根据需要启用
   - **System Prompt**：自定义 AI 的行为方式

## 获取 API Key

1. 访问 https://platform.deepseek.com
2. 注册账户
3. 进入 API 部分
4. 创建新的 API Key
5. 复制 Key 并粘贴到插件设置中

## 使用方法

### 基本使用

1. 在笔记中打开 Obsidian 命令面板（Ctrl+P）
2. 搜索 "Quick Ask AI"
3. 输入你的问题或提示
4. 按 Ctrl+Enter 提交
5. AI 响应将插入到你的文本中

### 使用文件引用（@mention）

```
总结 @notes.md 中的关键点，并提出三个建议
```

- 输入 `@` 来触发文件列表
- 选择一个文件或继续输入来过滤
- 文件内容会被自动包含在 prompt 中

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+P | 打开命令面板 |
| Ctrl+Enter | 提交 prompt |
| ↑↓ | 在文件列表中导航 |
| Enter | 选择文件 |
| Escape | 关闭文件列表 |

## 常见问题

### 错误："Request failed, status 404"

**原因**：API Key 无效或配置错误

**解决方案**：
1. 验证你的 API Key 是正确的
2. 确保 API Key 没有额外的空格
3. 检查网络连接
4. 重启 Obsidian

### 错误："h is not a constructor"

**原因**：插件加载问题

**解决方案**：
1. 禁用插件
2. 删除 `~/.obsidian/plugins/quick-ask-ai/` 文件夹
3. 重新复制最新的 `main.js` 和 `manifest.json`
4. 重启 Obsidian
5. 在设置中重新启用插件

### 插件不显示在命令面板中

**解决方案**：
1. 检查插件是否已启用（设置 → 社区插件）
2. 尝试重启 Obsidian
3. 检查开发者控制台（Ctrl+Shift+I）获取错误信息

### @mention 不起作用

**解决方案**：
- 确保你使用的是 markdown 文件（.md）
- 完整的文件路径应该包括扩展名：`@folder/note.md`
- 文件必须存在于你的 vault 中

## 调试

### 启用开发者控制台

1. Ctrl+Shift+I （Windows/Linux）或 Cmd+Option+I （Mac）
2. 查找错误和警告信息
3. 在 GitHub issues 中报告错误时包含控制台输出

### 检查日志

在开发者控制台中查找以 `plugin:quick-ask-ai` 开头的消息

## 环境变量

如果你在开发环境中：

```bash
# 设置调试模式（如果支持）
DEBUG=quick-ask-ai npm run dev
```

## 支持和反馈

如有问题或建议，请：
1. 检查 README.md 中的文档
2. 在开发者控制台中查看错误
3. 确保使用最新版本的插件
