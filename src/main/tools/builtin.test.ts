import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APP_ALLOWLIST, BUILTIN_TOOLS, openApp, setTimer, validateWebUrl, webSearch } from './builtin';
import type { Platform, ToolContext } from './types';

function ctxWith(os: NodeJS.Platform = 'win32') {
  const calls: string[] = [];
  const scheduled: number[] = [];
  const platform: Platform = {
    os,
    openExternal: async (u) => void calls.push(`open:${u}`),
    notify: () => {},
    writeClipboard: () => {},
    lockWorkStation: async () => {},
    launch: async (e, a) => void calls.push(`launch:${e} ${a.join(' ')}`.trim()),
  };
  const ctx: ToolContext = { platform, now: () => new Date(), schedule: (ms) => (scheduled.push(ms), () => {}) };
  return { ctx, calls, scheduled };
}

describe('validateWebUrl', () => {
  it('aceita http(s)', () => {
    assert.equal(validateWebUrl('https://exemplo.com/a?b=1').hostname, 'exemplo.com');
    assert.equal(validateWebUrl('http://localhost:3000').port, '3000');
  });
  it('recusa esquemas perigosos, credenciais e lixo', () => {
    for (const bad of ['file:///c:/windows/system32/calc.exe', 'javascript:alert(1)', 'ms-settings:', 'data:text/html,x', 'https://u:p@exemplo.com', 'não é url', '']) {
      assert.throws(() => validateWebUrl(bad), bad);
    }
    assert.throws(() => validateWebUrl(`https://a.com/${'x'.repeat(3000)}`));
  });
});

describe('open_app', () => {
  it('só abre itens da lista permitida', async () => {
    const { ctx, calls } = ctxWith();
    await openApp.run({ app: 'notepad' }, ctx);
    assert.deepEqual(calls, ['launch:notepad.exe']);
    for (const bad of ['cmd.exe', 'powershell', '../../x', '__proto__', 'constructor', 'toString']) {
      await assert.rejects(() => openApp.run({ app: bad }, ctx), /não é permitido/, bad);
    }
    assert.equal(calls.length, 1);
  });
  it('recusa fora do Windows', async () => {
    const { ctx } = ctxWith('linux');
    await assert.rejects(() => openApp.run({ app: 'notepad' }, ctx), /Windows/);
  });
  it('allowlist só contém executáveis do sistema sem caminho', () => {
    for (const e of Object.values(APP_ALLOWLIST)) assert.match(e.exe, /^[a-z]+\.exe$/);
  });
});

describe('web_search', () => {
  it('codifica a consulta na URL', async () => {
    const { ctx, calls } = ctxWith();
    await webSearch.run({ query: 'a&b=c d' }, ctx);
    assert.equal(calls[0], 'open:https://duckduckgo.com/?q=a%26b%3Dc%20d');
  });
});

describe('set_timer', () => {
  it('agenda em ms e valida limites', async () => {
    const { ctx, scheduled } = ctxWith();
    await setTimer.run({ minutes: 0.5, label: 'chá' }, ctx);
    assert.deepEqual(scheduled, [30_000]);
    await assert.rejects(() => setTimer.run({ minutes: 0 }, ctx));
    await assert.rejects(() => setTimer.run({ minutes: 99999 }, ctx));
    await assert.rejects(() => setTimer.run({ minutes: 'abc' }, ctx));
  });
});

describe('catálogo', () => {
  it('nomes únicos e ações sensíveis exigem confirmação', () => {
    const names = BUILTIN_TOOLS.map((t) => t.spec.name);
    assert.equal(new Set(names).size, names.length);
    for (const n of ['lock_pc', 'clipboard_write']) {
      assert.ok(BUILTIN_TOOLS.find((t) => t.spec.name === n)?.needsConfirm, `${n} deve exigir confirmação`);
    }
  });
});
