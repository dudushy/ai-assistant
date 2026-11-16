import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChatEvent, ChatMessage } from '../../shared/types';
import { BUILTIN_TOOLS } from '../tools/builtin';
import type { Platform, ToolContext } from '../tools/types';
import { Agent, MAX_STEPS, trimHistory } from './agent';
import type { ChatRequest, ChatResponse, Provider } from './provider';

function fakePlatform() {
  const calls: string[] = [];
  const p: Platform = {
    os: 'win32',
    openExternal: async (u) => void calls.push(`open:${u}`),
    notify: (t, b) => void calls.push(`notify:${t}:${b}`),
    writeClipboard: (t) => void calls.push(`clip:${t}`),
    lockWorkStation: async () => void calls.push('lock'),
    launch: async (e, a) => void calls.push(`launch:${e} ${a.join(' ')}`.trim()),
  };
  return { p, calls };
}

function scripted(responses: ChatResponse[]): Provider & { seen: ChatRequest[] } {
  const seen: ChatRequest[] = [];
  let i = 0;
  return {
    id: 'ollama',
    seen,
    listModels: async () => [],
    async chat(req) {
      seen.push({ ...req, messages: [...req.messages] });
      const r = responses[Math.min(i++, responses.length - 1)];
      if (!r) throw new Error('sem resposta roteirizada');
      return r;
    },
  };
}

function setup(responses: ChatResponse[], confirmAnswer = true) {
  const { p, calls } = fakePlatform();
  const ctx: ToolContext = { platform: p, now: () => new Date('2026-01-01T12:00:00Z'), schedule: (_ms, fn) => (fn(), () => {}) };
  const provider = scripted(responses);
  const events: ChatEvent[] = [];
  const confirms: string[] = [];
  const agent = new Agent({
    provider,
    tools: BUILTIN_TOOLS,
    ctx,
    confirm: async (tool, desc) => (confirms.push(`${tool}|${desc}`), confirmAnswer),
    onEvent: (e) => events.push(e),
  });
  return { agent, provider, calls, events, confirms };
}

describe('Agent', () => {
  it('responde direto sem ferramentas', async () => {
    const { agent } = setup([{ text: 'Olá!', toolCalls: [] }]);
    assert.equal(await agent.send('oi'), 'Olá!');
  });

  it('executa ferramenta segura e devolve o resultado ao modelo', async () => {
    const { agent, provider, calls } = setup([
      { text: '', toolCalls: [{ id: '1', name: 'open_app', args: { app: 'calculator' } }] },
      { text: 'Abri a calculadora.', toolCalls: [] },
    ]);
    assert.equal(await agent.send('abre a calculadora'), 'Abri a calculadora.');
    assert.deepEqual(calls, ['launch:calc.exe']);
    const second = provider.seen[1]!.messages;
    assert.equal(second.at(-1)?.role, 'tool');
  });

  it('pede confirmação em ação sensível e respeita a recusa', async () => {
    const { agent, calls, confirms, provider } = setup([
      { text: '', toolCalls: [{ id: '1', name: 'lock_pc', args: {} }] },
      { text: 'Ok, não bloqueei.', toolCalls: [] },
    ], false);
    await agent.send('bloqueia o pc');
    assert.equal(confirms.length, 1);
    assert.deepEqual(calls, []); // NÃO executou
    const tool = provider.seen[1]!.messages.at(-1) as Extract<ChatMessage, { role: 'tool' }>;
    assert.match(tool.content, /recusou/);
  });

  it('executa ação sensível quando aprovada', async () => {
    const { agent, calls } = setup([
      { text: '', toolCalls: [{ id: '1', name: 'lock_pc', args: {} }] },
      { text: 'Bloqueado.', toolCalls: [] },
    ]);
    await agent.send('bloqueia');
    assert.deepEqual(calls, ['lock']);
  });

  it('ferramenta inexistente e argumentos inválidos viram erro para o modelo, sem derrubar', async () => {
    const { agent, provider, calls } = setup([
      { text: '', toolCalls: [{ id: '1', name: 'rm_rf', args: {} }, { id: '2', name: 'open_url', args: { url: 'file:///c:/x' } }] },
      { text: 'Não deu.', toolCalls: [] },
    ]);
    await agent.send('faz coisas');
    const msgs = provider.seen[1]!.messages.filter((m) => m.role === 'tool') as Extract<ChatMessage, { role: 'tool' }>[];
    assert.match(msgs[0]!.content, /não existe/);
    assert.match(msgs[1]!.content, /Só é permitido/);
    assert.deepEqual(calls, []);
  });

  it('para após MAX_STEPS e restaura o histórico em erro do provedor', async () => {
    const loop: ChatResponse = { text: '', toolCalls: [{ id: 'x', name: 'get_datetime', args: {} }] };
    const { agent, provider } = setup([loop]);
    const out = await agent.send('loop');
    assert.match(out, /passos demais/);
    assert.equal(provider.seen.length, MAX_STEPS);

    const failing = setup([]);
    await assert.rejects(() => failing.agent.send('x'));
    // nova tentativa após falha não acumula a mensagem do usuário anterior
    const again = setup([{ text: 'ok', toolCalls: [] }]);
    await again.agent.send('y');
    assert.equal(again.provider.seen[0]!.messages.length, 1);
  });
});

describe('trimHistory', () => {
  it('corta sempre num turno do usuário (sem tool órfão)', () => {
    const h: ChatMessage[] = [];
    for (let i = 0; i < 30; i++) {
      h.push({ role: 'user', content: `u${i}` });
      h.push({ role: 'assistant', content: '', toolCalls: [{ id: `c${i}`, name: 'x', args: {} }] });
      h.push({ role: 'tool', toolCallId: `c${i}`, name: 'x', content: 'r' });
      h.push({ role: 'assistant', content: `a${i}` });
    }
    const t = trimHistory(h, 40);
    assert.ok(t.length <= 40);
    assert.equal(t[0]?.role, 'user');
  });
});
