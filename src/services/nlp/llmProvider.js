import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

// Base LLM Provider interface
class BaseLLMProvider {
  async complete(messages, options = {}) {
    throw new Error('Not implemented');
  }

  async embed(text) {
    throw new Error('Not implemented');
  }
}

// Anthropic Claude Provider
class AnthropicProvider extends BaseLLMProvider {
  constructor() {
    super();
    this.client = new Anthropic({
      apiKey: config.llm.anthropicApiKey,
    });
    this.model = config.llm.model.anthropic;
  }

  async complete(messages, options = {}) {
    const {
      maxTokens = 1024,
      temperature = 0.3,
      systemPrompt = null,
    } = options;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt || undefined,
        messages: messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      });

      const content = response.content[0];
      return {
        text: content.type === 'text' ? content.text : '',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        stopReason: response.stop_reason,
      };
    } catch (error) {
      logger.error('Anthropic API error', { error: error.message });
      throw error;
    }
  }

  // Anthropic doesn't have native embeddings, use OpenAI for this
  async embed(text) {
    throw new Error('Anthropic does not support embeddings. Use OpenAI provider for embeddings.');
  }
}

// OpenAI Provider
class OpenAIProvider extends BaseLLMProvider {
  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: config.llm.openaiApiKey,
    });
    this.model = config.llm.model.openai;
    this.embeddingModel = config.llm.embeddingModel.openai;
  }

  async complete(messages, options = {}) {
    const {
      maxTokens = 1024,
      temperature = 0.3,
      systemPrompt = null,
      responseFormat = null,
    } = options;

    try {
      const apiMessages = [];
      
      if (systemPrompt) {
        apiMessages.push({ role: 'system', content: systemPrompt });
      }

      apiMessages.push(...messages.map(m => ({
        role: m.role,
        content: m.content,
      })));

      const requestParams = {
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        messages: apiMessages,
      };

      if (responseFormat === 'json') {
        requestParams.response_format = { type: 'json_object' };
      }

      const response = await this.client.chat.completions.create(requestParams);

      return {
        text: response.choices[0].message.content,
        usage: {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        },
        stopReason: response.choices[0].finish_reason,
      };
    } catch (error) {
      logger.error('OpenAI API error', { error: error.message });
      throw error;
    }
  }

  async embed(text) {
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      return {
        embedding: response.data[0].embedding,
        dimensions: response.data[0].embedding.length,
        usage: {
          tokens: response.usage.total_tokens,
        },
      };
    } catch (error) {
      logger.error('OpenAI Embedding error', { error: error.message });
      throw error;
    }
  }

  async embedBatch(texts) {
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: texts,
      });

      return {
        embeddings: response.data.map(d => d.embedding),
        dimensions: response.data[0]?.embedding.length || 0,
        usage: {
          tokens: response.usage.total_tokens,
        },
      };
    } catch (error) {
      logger.error('OpenAI Batch Embedding error', { error: error.message });
      throw error;
    }
  }
}

// Factory to get provider
export const getProvider = (providerName = null) => {
  const name = providerName || config.llm.provider;
  
  switch (name) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIProvider();
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
};

// Get embedding provider (always OpenAI for now)
export const getEmbeddingProvider = () => {
  return new OpenAIProvider();
};

export { AnthropicProvider, OpenAIProvider };
export default { getProvider, getEmbeddingProvider };
