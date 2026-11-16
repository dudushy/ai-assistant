import type { ChatEvent, ChatResult, ProviderId, PublicSettings, SettingsPatch } from './types';

/**
 * Contrato de IPC. ATENÇÃO: o preload roda em sandbox e não pode importar este arquivo em runtime;
 * ele repete os nomes dos canais como literais (checados por tipo contra `IpcInvoke`/`IpcEvents`).
 */
export interface IpcInvoke {
  'chat:send': (text: string) => ChatResult;
  'chat:reset': () => void;
  'chat:cancel': () => void;
  'confirm:respond': (id: string, approved: boolean) => void;
  'settings:get': () => PublicSettings;
  'settings:set': (patch: SettingsPatch) => PublicSettings;
  'settings:setKey': (provider: ProviderId, key: string) => PublicSettings;
  'settings:test': () => ChatResult;
  'ui:resize': (height: number) => void;
  'ui:hide': () => void;
}

export interface IpcEvents {
  'chat:event': ChatEvent;
  'ui:shown': undefined;
}

/** API exposta ao renderer via contextBridge (window.api). */
export interface RendererApi {
  sendMessage(text: string): Promise<ChatResult>;
  resetChat(): Promise<void>;
  cancelChat(): Promise<void>;
  respondConfirm(id: string, approved: boolean): Promise<void>;
  getSettings(): Promise<PublicSettings>;
  setSettings(patch: SettingsPatch): Promise<PublicSettings>;
  setApiKey(provider: ProviderId, key: string): Promise<PublicSettings>;
  testProvider(): Promise<ChatResult>;
  resize(height: number): Promise<void>;
  hide(): Promise<void>;
  onChatEvent(cb: (e: ChatEvent) => void): () => void;
  onShown(cb: () => void): () => void;
}
