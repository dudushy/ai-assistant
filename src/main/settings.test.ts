import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { type SecretCodec, SettingsStore } from './settings';

const codec = (available = true): SecretCodec => ({
  available: () => available,
  init: async () => {},
  encrypt: async (s) => Buffer.from(`ENC(${s})`),
  decrypt: async (b) => b.toString().replace(/^ENC\(|\)$/g, ''),
});

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aia-')), 'settings.json');

describe('SettingsStore', () => {
  it('chave é guardada cifrada e nunca aparece nas configurações públicas', async () => {
    const file = tmpFile();
    const s = new SettingsStore(file, codec());
    const pub = await s.setKey('groq', 'gsk_SEGREDO');
    assert.equal(pub.hasKey.groq, true);
    assert.equal(JSON.stringify(pub).includes('SEGREDO'), false);
    assert.equal(fs.readFileSync(file, 'utf8').includes('gsk_SEGREDO'), false, 'não pode estar em texto puro no disco');
    assert.equal(await s.getApiKey('groq'), 'gsk_SEGREDO');
    // persiste entre instâncias
    assert.equal(await new SettingsStore(file, codec()).getApiKey('groq'), 'gsk_SEGREDO');
  });

  it('sem criptografia disponível, recusa salvar a chave', async () => {
    const s = new SettingsStore(tmpFile(), codec(false));
    await assert.rejects(() => s.setKey('groq', 'x'), /NÃO foi salva/);
    assert.equal(s.getPublic().hasKey.groq, false);
  });

  it('chave vazia remove', async () => {
    const s = new SettingsStore(tmpFile(), codec());
    await s.setKey('gemini', 'k');
    assert.equal((await s.setKey('gemini', '  ')).hasKey.gemini, false);
  });

  it('valida entradas', () => {
    const s = new SettingsStore(tmpFile(), codec());
    assert.throws(() => s.patch({ provider: 'nope' as never }));
    assert.throws(() => s.patch({ ollamaUrl: 'file:///x' }));
    assert.throws(() => s.patch({ ollamaUrl: 'http://u:p@localhost:11434' }));
    assert.throws(() => s.patch({ shortcut: '' }));
    assert.equal(s.patch({ ollamaUrl: 'http://localhost:11434/' }).ollamaUrl, 'http://localhost:11434');
    assert.equal(s.patch({ models: { groq: '' } }).models.groq, 'llama-3.3-70b-versatile');
  });

  it('arquivo corrompido volta aos padrões', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{ quebrado');
    assert.equal(new SettingsStore(file, codec()).getPublic().provider, 'groq');
  });
});
