import type { RendererApi } from '../shared/ipc';
import type { ChatEvent, ProviderId, PublicSettings } from '../shared/types';

declare global {
  interface Window {
    api: RendererApi;
  }
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} não encontrado`);
  return el as T;
};

const bar = $('bar');
const messages = $('messages');
const form = $<HTMLFormElement>('form');
const input = $<HTMLInputElement>('input');
const btnSend = $<HTMLButtonElement>('btn-send');
const confirmBox = $('confirm');
const confirmText = $('confirm-text');
const settingsBox = $('settings');

let settings: PublicSettings;
let busy = false;
let pendingConfirmId: string | null = null;

/** Ajusta a altura da janela ao conteúdo (usa só textContent — nunca innerHTML). */
function fit(): void {
  const style = getComputedStyle(bar);
  const gap = parseFloat(style.rowGap) || 0;
  const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const visible = [...bar.children].filter((c) => !(c as HTMLElement).hidden && (c as HTMLElement).offsetParent !== null);
  const total = visible.reduce((h, c) => h + (c === messages ? messages.scrollHeight : (c as HTMLElement).offsetHeight), 0);
  void window.api.resize(Math.ceil(total + gap * Math.max(0, visible.length - 1) + pad + 2));
}

function addMessage(kind: 'user' | 'bot' | 'error' | 'tool' | 'pending', text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `msg ${kind}`;
  el.textContent = text;
  messages.append(el);
  messages.scrollTop = messages.scrollHeight;
  fit();
  return el;
}

function setBusy(v: boolean): void {
  busy = v;
  btnSend.disabled = false;
  btnSend.textContent = v ? '■' : '➤';
  btnSend.setAttribute('aria-label', v ? 'Cancelar' : 'Enviar');
  input.disabled = v;
  if (!v) input.focus();
}

async function submit(): Promise<void> {
  if (busy) {
    await window.api.cancelChat();
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMessage('user', text);
  const pending = addMessage('pending', 'pensando…');
  setBusy(true);
  try {
    const res = await window.api.sendMessage(text);
    pending.remove();
    if (res.ok) addMessage('bot', res.text);
    else addMessage('error', res.error ?? 'Erro desconhecido.');
  } catch (e) {
    pending.remove();
    addMessage('error', e instanceof Error ? e.message : String(e));
  } finally {
    setBusy(false);
    fit();
  }
}

function onChatEvent(e: ChatEvent): void {
  if (e.type === 'tool') {
    addMessage('tool', `⚙ ${e.summary}`);
  } else {
    pendingConfirmId = e.request.id;
    confirmText.textContent = `O assistente quer: ${e.request.description}. Permitir?`;
    confirmBox.hidden = false;
    fit();
  }
}

async function answerConfirm(ok: boolean): Promise<void> {
  if (!pendingConfirmId) return;
  const id = pendingConfirmId;
  pendingConfirmId = null;
  confirmBox.hidden = true;
  fit();
  await window.api.respondConfirm(id, ok);
}

// ---------- configurações ----------
const selProvider = $<HTMLSelectElement>('set-provider');
const inModel = $<HTMLInputElement>('set-model');
const inKey = $<HTMLInputElement>('set-key');
const inUrl = $<HTMLInputElement>('set-url');
const inShortcut = $<HTMLInputElement>('set-shortcut');
const inBlur = $<HTMLInputElement>('set-blur');
const rowKey = $('row-key');
const rowUrl = $('row-url');
const status = $('set-status');

function setStatus(text: string, err = false): void {
  status.textContent = text;
  status.classList.toggle('err', err);
  fit();
}

function currentProvider(): ProviderId {
  return selProvider.value as ProviderId;
}

function renderProviderFields(): void {
  const id = currentProvider();
  const info = settings.providers.find((p) => p.id === id);
  inModel.value = settings.models[id];
  rowKey.hidden = !info?.needsKey;
  rowUrl.hidden = id !== 'ollama';
  inKey.value = '';
  inKey.placeholder = settings.hasKey[id] ? '••••••••  (chave salva — cole outra para trocar)' : 'cole aqui (fica criptografada)';
  fit();
}

function fillSettings(s: PublicSettings): void {
  settings = s;
  selProvider.replaceChildren(
    ...s.providers.map((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.label;
      return o;
    }),
  );
  selProvider.value = s.provider;
  inUrl.value = s.ollamaUrl;
  inShortcut.value = s.shortcut;
  inBlur.checked = s.hideOnBlur;
  renderProviderFields();
}

async function saveSettings(): Promise<boolean> {
  try {
    const id = currentProvider();
    const key = inKey.value.trim();
    if (key) fillSettings(await window.api.setApiKey(id, key));
    fillSettings(
      await window.api.setSettings({
        provider: id,
        models: { [id]: inModel.value },
        ollamaUrl: inUrl.value,
        shortcut: inShortcut.value,
        hideOnBlur: inBlur.checked,
      }),
    );
    setStatus('Salvo ✔');
    return true;
  } catch (e) {
    setStatus(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e), true);
    return false;
  }
}

async function testConnection(): Promise<void> {
  if (!(await saveSettings())) return;
  setStatus('Testando…');
  const r = await window.api.testProvider();
  setStatus(r.ok ? `Conectado ✔ (resposta: ${r.text})` : (r.error ?? 'Falhou.'), !r.ok);
}

function toggleSettings(): void {
  settingsBox.hidden = !settingsBox.hidden;
  if (!settingsBox.hidden) setStatus(settings.encryptionAvailable ? '' : '⚠ Criptografia do sistema indisponível: chaves não podem ser salvas.', !settings.encryptionAvailable);
  fit();
}

// ---------- eventos ----------
form.addEventListener('submit', (e) => {
  e.preventDefault();
  void submit();
});
$('btn-settings').addEventListener('click', toggleSettings);
$('btn-new').addEventListener('click', () => {
  void window.api.resetChat();
  messages.replaceChildren();
  fit();
  input.focus();
});
$('confirm-yes').addEventListener('click', () => void answerConfirm(true));
$('confirm-no').addEventListener('click', () => void answerConfirm(false));
$('set-save').addEventListener('click', () => void saveSettings());
$('set-test').addEventListener('click', () => void testConnection());
selProvider.addEventListener('change', renderProviderFields);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!settingsBox.hidden) toggleSettings();
    else void window.api.hide();
  }
});
window.api.onChatEvent(onChatEvent);
window.api.onShown(() => {
  input.focus();
  input.select();
});

void window.api.getSettings().then((s) => {
  fillSettings(s);
  const info = s.providers.find((p) => p.id === s.provider);
  if (info?.needsKey && !s.hasKey[s.provider]) {
    addMessage('bot', `Bem-vindo! Para começar, abra ⚙ e configure ${info.label}${info.keyHelpUrl ? ` (chave em ${info.keyHelpUrl})` : ''}.`);
  }
  fit();
});
