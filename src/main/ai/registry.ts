import { PROVIDERS, type ProviderId } from '../../shared/types';
import { type Provider, type ProviderConfig, ProviderError } from './provider';
import { createAnthropicProvider } from './providers/anthropic';
import { createGeminiProvider } from './providers/gemini';
import { createOllamaProvider } from './providers/ollama';
import { createOpenAICompatProvider } from './providers/openai-compat';

export function createProvider(id: ProviderId, cfg: ProviderConfig): Provider {
  if (PROVIDERS[id].needsKey && !cfg.apiKey) {
    throw new ProviderError(`Falta a chave de API de ${PROVIDERS[id].label}. Abra as configurações (⚙) e cole a chave.`);
  }
  const model = cfg.model || PROVIDERS[id].defaultModel;
  switch (id) {
    case 'ollama':
      return createOllamaProvider(cfg.ollamaUrl, model);
    case 'groq':
      return createOpenAICompatProvider('groq', 'https://api.groq.com/openai/v1', cfg.apiKey, model);
    case 'gemini':
      return createGeminiProvider(cfg.apiKey, model);
    case 'anthropic':
      return createAnthropicProvider(cfg.apiKey, model);
  }
}
