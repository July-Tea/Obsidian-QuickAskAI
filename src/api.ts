import { QuickAskAISettings } from './settings';

export interface MessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class DeepseekAPI {
  private settings: QuickAskAISettings;

  constructor(settings: QuickAskAISettings) {
    this.settings = settings;
  }

  async chat(userMessage: string): Promise<string> {
    const messages: MessageParam[] = [
      {
        role: 'system',
        content: this.settings.systemPromptPrefix
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    const requestBody: any = {
      model: this.settings.model,
      messages: messages,
      stream: false,
      temperature: 1.0,
    };

    if (this.settings.enableThinking) {
      requestBody.reasoning_effort = this.settings.thinkingLevel;
    }

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      throw new Error(`Failed to call Deepseek API: ${error}`);
    }
  }

  async *chatStream(userMessage: string): AsyncGenerator<string> {
    const messages: MessageParam[] = [
      {
        role: 'system',
        content: this.settings.systemPromptPrefix
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    const requestBody: any = {
      model: this.settings.model,
      messages: messages,
      stream: true,
      temperature: 1.0,
    };

    if (this.settings.enableThinking) {
      requestBody.reasoning_effort = this.settings.thinkingLevel;
    }

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to call Deepseek API: ${error}`);
    }
  }
}
