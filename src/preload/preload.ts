import { contextBridge, ipcRenderer } from 'electron';
import type { IpcEvents, IpcInvoke, RendererApi } from '../shared/ipc';

// O preload roda em sandbox: não pode importar módulos locais em runtime (só tipos).
// Os nomes dos canais são literais, verificados contra IpcInvoke/IpcEvents pelo compilador.
const invoke = <K extends keyof IpcInvoke>(channel: K, ...args: Parameters<IpcInvoke[K]>) =>
  ipcRenderer.invoke(channel, ...args) as Promise<ReturnType<IpcInvoke[K]>>;

const on = <K extends keyof IpcEvents>(channel: K, cb: (payload: IpcEvents[K]) => void) => {
  const listener = (_e: unknown, payload: IpcEvents[K]) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const api: RendererApi = {
  sendMessage: (text) => invoke('chat:send', text),
  resetChat: () => invoke('chat:reset'),
  cancelChat: () => invoke('chat:cancel'),
  respondConfirm: (id, approved) => invoke('confirm:respond', id, approved),
  getSettings: () => invoke('settings:get'),
  setSettings: (patch) => invoke('settings:set', patch),
  setApiKey: (provider, key) => invoke('settings:setKey', provider, key),
  testProvider: () => invoke('settings:test'),
  resize: (height) => invoke('ui:resize', height),
  hide: () => invoke('ui:hide'),
  onChatEvent: (cb) => on('chat:event', cb),
  onShown: (cb) => on('ui:shown', () => cb()),
};

contextBridge.exposeInMainWorld('api', api);
