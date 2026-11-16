import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChatMessage, ToolSpec } from '../../../shared/types';
import { parseArgs } from '../provider';
import { parseAnthropicResponse, toAnthropicMessages } from './anthropic';
import { parseGeminiResponse, toGeminiContents, toGeminiTools } from './gemini';
import { parseOllamaResponse, toOllamaMessages } from './ollama';
import { parseOpenAIResponse, toOpenAIMessages } from './openai-compat';

const convo: ChatMessage[] = [
  { role: 'user', content: 'abre a calculadora e me diz a hora' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [
      { id: 'a', name: 'open_app', args: { app: 'calculator' } },
      { id: 'b', name: 'get_datetime', args: {} },
    ],
  },
  { role: 'tool', toolCallId: 'a', name: 'open_app', content: 'Abri Calculadora.' },
  { role: 'tool', toolCallId: 'b', name: 'get_datetime', content: '10:00' },
];

describe('parseArgs', () => {
  it('aceita string JSON, objeto e lixo', () => {
    assert.deepEqual(parseArgs('{"a":1}'), { a: 1 });
    assert.deepEqual(parseArgs({ a: 1 }), { a: 1 });
    assert.deepEqual(parseArgs('não é json'), {});
    assert.deepEqual(parseArgs('[1,2]'), {});
    assert.deepEqual(parseArgs(null), {});
  });
});

describe('OpenAI-compat (Groq)', () => {
  it('converte conversa com ferramentas', () => {
    const out = toOpenAIMessages('sys', convo);
    assert.equal(out[0]?.role, 'system');
    assert.equal(out[2]?.tool_calls?.length, 2);
    assert.equal(out[2]?.tool_calls?.[0]?.function.arguments, '{"app":"calculator"}');
    assert.equal(out[3]?.role, 'tool');
    assert.equal(out[3]?.tool_call_id, 'a');
  });
  it('interpreta tool_calls da resposta', () => {
    const r = parseOpenAIResponse({
      choices: [{ message: { content: null, tool_calls: [{ id: 'x', function: { name: 'open_url', arguments: '{"url":"https://a.com"}' } }] } }],
    });
    assert.deepEqual(r.toolCalls, [{ id: 'x', name: 'open_url', args: { url: 'https://a.com' } }]);
    assert.equal(r.text, '');
  });
  it('erro se não vier mensagem', () => {
    assert.throws(() => parseOpenAIResponse({ choices: [] }));
  });
});

describe('Ollama', () => {
  it('usa arguments como objeto e tool_name', () => {
    const out = toOllamaMessages('sys', convo);
    assert.deepEqual(out[2]?.tool_calls?.[0], { function: { name: 'open_app', arguments: { app: 'calculator' } } });
    assert.equal(out[3]?.tool_name, 'open_app');
  });
  it('gera ids sintéticos', () => {
    const r = parseOllamaResponse({ message: { content: 'x', tool_calls: [{ function: { name: 'a', arguments: { k: 1 } } }] } });
    assert.deepEqual(r.toolCalls, [{ id: 'call_0', name: 'a', args: { k: 1 } }]);
  });
});

describe('Gemini', () => {
  it('junta resultados de ferramentas num único turno do usuário', () => {
    const out = toGeminiContents(convo);
    assert.equal(out.length, 3);
    assert.equal(out[1]?.role, 'model');
    assert.equal(out[2]?.role, 'user');
    assert.equal(out[2]?.parts.length, 2);
  });
  it('omite parameters em ferramentas sem argumentos e usa tipos maiúsculos', () => {
    const tools: ToolSpec[] = [
      { name: 'get_datetime', description: 'd', parameters: { type: 'object', properties: {} } },
      { name: 'open_url', description: 'u', parameters: { type: 'object', properties: { url: { type: 'string', description: 'x' } }, required: ['url'] } },
    ];
    const decls = toGeminiTools(tools)?.[0]?.functionDeclarations as Record<string, unknown>[];
    assert.equal('parameters' in (decls[0] ?? {}), false);
    assert.deepEqual((decls[1]?.['parameters'] as { properties: Record<string, { type: string }> }).properties['url']?.type, 'STRING');
  });
  it('lê texto e functionCall', () => {
    const r = parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'oi' }, { functionCall: { name: 'f', args: { a: 1 } } }] } }] });
    assert.equal(r.text, 'oi');
    assert.deepEqual(r.toolCalls, [{ id: 'call_0', name: 'f', args: { a: 1 } }]);
  });
  it('bloqueio de segurança vira erro claro', () => {
    assert.throws(() => parseGeminiResponse({ candidates: [{ finishReason: 'SAFETY' }] }), /bloqueado/);
  });
});

describe('Anthropic', () => {
  it('agrupa tool_result no mesmo turno e usa tool_use_id', () => {
    const out = toAnthropicMessages(convo);
    assert.equal(out.length, 3);
    const last = out[2];
    assert.ok(Array.isArray(last?.content) && last.content.length === 2);
    assert.deepEqual(last.content[0], { type: 'tool_result', tool_use_id: 'a', content: 'Abri Calculadora.' });
  });
  it('lê text e tool_use', () => {
    const r = parseAnthropicResponse({ content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'lock_pc', input: {} }] });
    assert.equal(r.text, 'ok');
    assert.deepEqual(r.toolCalls, [{ id: 't1', name: 'lock_pc', args: {} }]);
  });
});
