import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProviderId } from '../../shared/types';
import { filterChatModels, pickFallbackModel } from './models';
import { isModelNotFound, withModelRecovery } from './modelRecovery';
import { type Provider, ProviderError } from './provider';
import { parseAnthropicModels } from './providers/anthropic';
import { parseGeminiModels } from './providers/gemini';
import { parseOllamaModels } from './providers/ollama';
import { parseOpenAIModels } from './providers/openai-compat';

describe('listagem de modelos (parsers)', () => {
  it('OpenAI/Groq e Anthropic: data[].id', () => {
    assert.deepEqual(parseOpenAIModels({ data: [{ id: 'a' }, { id: 'b' }, {}] }), ['a', 'b']);
    assert.deepEqual(parseAnthropicModels({ data: [{ id: 'claude-x' }] }), ['claude-x']);
    assert.deepEqual(parseOpenAIModels({}), []);
  });
  it('Ollama: models[].name', () => {
    assert.deepEqual(parseOllamaModels({ models: [{ name: 'llama3.2:latest' }] }), ['llama3.2:latest']);
  });
  it('Gemini: só generateContent e sem prefixo models/', () => {
    const r = parseGeminiModels({
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ],
    });
    assert.deepEqual(r, ['gemini-2.5-flash']);
  });
});

describe('filterChatModels / pickFallbackModel', () => {
  it('remove áudio/embedding/guard e duplicatas', () => {
    assert.deepEqual(filterChatModels(['whisper-large-v3', 'llama-guard-4', 'a', 'a', 'text-embedding-3', 'b']), ['a', 'b']);
  });
  it('Groq: segue a preferência e nunca devolve o modelo atual', () => {
    const avail = ['llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'whisper-large-v3', 'openai/gpt-oss-20b'];
    assert.equal(pickFallbackModel('groq', avail, 'llama-3.3-70b-versatile'), 'openai/gpt-oss-120b');
    assert.equal(pickFallbackModel('groq', avail, 'openai/gpt-oss-120b'), 'openai/gpt-oss-20b');
  });
  it('Gemini prefere flash puro; Anthropic prefere haiku mais novo', () => {
    assert.equal(pickFallbackModel('gemini', ['gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'], 'x'), 'gemini-2.5-flash');
    assert.equal(pickFallbackModel('anthropic', ['claude-opus-5', 'claude-haiku-4', 'claude-haiku-5'], 'x'), 'claude-haiku-5');
  });
  it('sem preferência casando, usa o primeiro; sem candidatos, null', () => {
    assert.equal(pickFallbackModel('groq', ['zeta', 'alfa'], 'x'), 'zeta');
    assert.equal(pickFallbackModel('groq', ['whisper-large-v3'], 'x'), null);
    assert.equal(pickFallbackModel('groq', [], 'x'), null);
  });
});

function fakeProvider(id: ProviderId, chat: () => Promise<{ text: string; toolCalls: [] }>, models: string[] | Error): Provider {
  return {
    id,
    chat,
    listModels: async () => {
      if (models instanceof Error) throw models;
      return models;
    },
  };
}

describe('withModelRecovery', () => {
  const notFound = () => Promise.reject(new ProviderError('model does not exist', 404));
  const ok = () => Promise.resolve({ text: 'ok', toolCalls: [] as [] });

  function setup(models: string[] | Error, working: string[]) {
    const saved: string[] = [];
    const built: string[] = [];
    return {
      saved,
      built,
      deps: {
        providerId: 'groq' as ProviderId,
        currentModel: 'old-model',
        build: async (m: string) => (built.push(m), fakeProvider('groq', working.includes(m) ? ok : notFound, models)),
        run: (p: Provider) => p.chat({ system: '', messages: [], tools: [] }),
        saveModel: (m: string) => void saved.push(m),
      },
    };
  }

  it('não interfere quando funciona', async () => {
    const s = setup([], ['old-model']);
    const r = await withModelRecovery(s.deps);
    assert.equal(r.value.text, 'ok');
    assert.equal(r.notice, undefined);
    assert.deepEqual(s.saved, []);
  });

  it('em 404: lista, escolhe, repete uma vez, salva e avisa', async () => {
    const s = setup(['openai/gpt-oss-120b', 'whisper-large-v3'], ['openai/gpt-oss-120b']);
    const r = await withModelRecovery(s.deps);
    assert.equal(r.value.text, 'ok');
    assert.match(r.notice ?? '', /old-model.*gpt-oss-120b/);
    assert.deepEqual(s.saved, ['openai/gpt-oss-120b']);
    assert.deepEqual(s.built, ['old-model', 'openai/gpt-oss-120b']);
  });

  it('se o substituto também falha, não salva e propaga o erro', async () => {
    const s = setup(['other'], []);
    await assert.rejects(() => withModelRecovery(s.deps), /does not exist/);
    assert.deepEqual(s.saved, []);
  });

  it('sem candidatos: erro claro; falha ao listar: mantém o erro original', async () => {
    await assert.rejects(() => withModelRecovery(setup(['whisper-large-v3'], []).deps), /nenhum outro modelo/);
    await assert.rejects(() => withModelRecovery(setup(new ProviderError('401', 401), []).deps), /does not exist/);
  });

  it('só reage a 404 (401/429/rede passam direto, sem listar)', async () => {
    const deps = setup(['x'], []).deps;
    deps.build = async () => fakeProvider('groq', () => Promise.reject(new ProviderError('chave inválida', 401)), ['x']);
    await assert.rejects(() => withModelRecovery(deps), /chave inválida/);
    assert.equal(isModelNotFound(new ProviderError('x', 404)), true);
    assert.equal(isModelNotFound(new ProviderError('x', 429)), false);
    assert.equal(isModelNotFound(new Error('x')), false);
  });
});
