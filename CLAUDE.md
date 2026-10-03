# Quick Ask AI - Obsidian Plugin Development Guide

## Project Overview
Quick Ask AI is an Obsidian plugin that integrates Deepseek AI API for quick question-answering directly within Obsidian notes.

## Project Structure
```
.
├── src/
│   ├── main.ts          # Plugin entry point, command registration
│   ├── settings.ts      # Settings tab and configuration interface
│   ├── api.ts           # Deepseek API client
│   ├── modal.ts         # Input modal and response insertion logic
│   └── styles.css       # Styling and loading animations
├── manifest.json        # Plugin metadata
├── package.json         # Project dependencies
├── tsconfig.json        # TypeScript configuration
└── esbuild.config.mjs   # Build configuration
```

## Key Features
- **Settings Panel**: Configure API Key, model selection, thinking mode
- **Quick Ask Command**: Ctrl+P → "Quick Ask AI" to open input modal
- **Smart Text Insertion**: Replace selected text or insert at cursor
- **Loading Animation**: Visual feedback with spinning cursor animation
- **System Prompt**: Customizable prefix for AI behavior

## Development Commands
- `npm install` - Install dependencies
- `npm run dev` - Start development build with watch mode
- `npm run build` - Production build

## Technical Details

### API Integration (src/api.ts)
- Uses Deepseek API endpoint: `https://api.deepseek.com/v1/chat/completions`
- Supports both regular chat and streaming responses
- Configurable reasoning effort for thinking mode (low/medium/high)

### Settings Structure (src/settings.ts)
- Provider: 'deepseek' (extensible for future providers)
- Model selection with predefined Deepseek models
- Thinking mode configuration
- System prompt customization

### UI Components
- Modal: Obsidian's native Modal class for input/output
- Settings Tab: Obsidian's SettingTab for configuration
- CSS: Custom animations for loading states

## Building for Production

1. Run `npm run build` to create minified `main.js` and `main.css`
2. Copy `main.js`, `main.css`, and `manifest.json` to Obsidian's plugin folder:
   `~/.obsidian/plugins/quick-ask-ai/`
3. Reload Obsidian to activate the plugin

## Testing Locally
1. Install Obsidian desktop app
2. Create a test vault
3. Use `npm run dev` during development
4. Reload plugin in Obsidian settings

## API Key Setup
Users need to:
1. Sign up at https://platform.deepseek.com
2. Generate API key
3. Paste it in plugin settings

## Future Enhancements
- Support for multiple AI providers (OpenAI, Claude, etc.)
- Streaming response display
- Conversation history
- Custom prompt templates
- Keyboard shortcuts customization
