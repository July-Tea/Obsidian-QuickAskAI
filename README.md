# Quick Ask AI

An Obsidian plugin that integrates AI-powered question answering directly into your notes using Deepseek API.

## Features

- **Quick Ask Command**: Use Ctrl+P and search for "Quick Ask AI" to open the prompt input modal
- **Provider Support**: Currently supports Deepseek AI
- **Flexible Configuration**: 
  - Set your API Key and model selection
  - Enable/disable thinking mode with adjustable depth (low/medium/high)
  - Customize system prompt prefix
- **Smart Text Insertion**:
  - If text is selected, it will be replaced with AI response
  - If no text is selected, response is inserted at cursor position
- **File References with @mention**: Use `@filename.md` to include file contents in your prompt
- **Auto-complete Suggestion**: Type `@` to see matching files from your vault
- **Loading Animation**: Visual feedback while waiting for API response
- **Native Obsidian UI**: Uses Obsidian's standard components for settings and modals

## Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run dev` to build the plugin
4. Copy the `main.js`, `manifest.json`, and `styles.css` files to your Obsidian vault's `.obsidian/plugins/quick-ask-ai/` directory
5. Reload Obsidian

## Configuration

After installation, open Obsidian Settings and go to "Quick Ask AI" to configure:

1. **API Key**: Your Deepseek API key (get one from https://platform.deepseek.com)
2. **Model**: Choose from available Deepseek models:
   - `deepseek-chat` (default)
   - `deepseek-reasoner` (R1 - for complex reasoning)
   - `deepseek-v4-flash`
   - `deepseek-v4-pro`
3. **Enable Thinking**: Toggle to enable reasoning mode
4. **Thinking Level**: If enabled, choose depth (low/medium/high)
5. **System Prompt Prefix**: Customize how the AI should behave

## Usage

### Basic Usage
1. Open your Obsidian note
2. Press Ctrl+P (Cmd+P on Mac) to open command palette
3. Search for "Quick Ask AI"
4. Enter your prompt in the input field
5. Press Ctrl+Enter (Cmd+Enter on Mac) or click "Ask" button to get response
6. Response will be inserted at your cursor location

### Using File References
You can reference files in your vault by typing `@filename.md`:

```
Summarize the main points from @project-notes.md and give recommendations
```

Type `@` and a dropdown will appear showing matching files. Select a file and it will be automatically included in your prompt. The file's content will be appended to your message when sent to the AI.

### Keyboard Shortcuts
- `Ctrl+Enter` (Cmd+Enter on Mac) - Submit prompt
- `Escape` - Close mention dropdown
- `↑↓` - Navigate through file suggestions when dropdown is open
- `Enter` - Select highlighted file from dropdown

## Development

- `npm run dev` - Start development with watch mode
- `npm run build` - Build for production

## Sources
- [Deepseek API Documentation](https://platform.deepseek.com)
- [Obsidian Plugin Development Guide](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian Sample Plugin Template](https://github.com/obsidianmd/obsidian-sample-plugin)
