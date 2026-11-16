/** Tipos compartilhados entre main, preload e renderer. Somente tipos/constantes puras (sem Electron/Node). */

export const PROVIDER_IDS = ['ollama', 'groq', 'gemini', 'anthropic'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Formato interno de mensagem, independente de provedor. Cada adapter converte de/para o seu formato. */
export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

/** Subconjunto de JSON Schema usado para descrever os parâmetros das ferramentas. */
export interface ToolSchema {
  type: 'object';
  properties: Record<string, { type: 'string' | 'number' | 'boolean'; description: string; enum?: string[] }>;
  required?: string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: ToolSchema;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  needsKey: boolean;
  defaultModel: string;
  keyHelpUrl?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  ollama: { id: 'ollama', label: 'Ollama (local)', needsKey: false, defaultModel: 'llama3.2' },
  groq: {
    id: 'groq',
    label: 'Groq (grátis na nuvem)',
    needsKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    keyHelpUrl: 'https://console.groq.com/keys',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    needsKey: true,
    defaultModel: 'gemini-2.0-flash',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    needsKey: true,
    defaultModel: 'claude-haiku-5-5',
    keyHelpUrl: 'https://platform.claude.com/settings/keys',
  },
};

/** Configurações visíveis ao renderer. NUNCA inclui chaves de API (apenas se existem). */
export interface PublicSettings {
  provider: ProviderId;
  models: Record<ProviderId, string>;
  ollamaUrl: string;
  hasKey: Record<ProviderId, boolean>;
  shortcut: string;
  hideOnBlur: boolean;
  encryptionAvailable: boolean;
  /** catálogo de provedores (para o renderer montar o seletor sem importar código em runtime) */
  providers: ProviderInfo[];
}

export type SettingsPatch = Partial<Pick<PublicSettings, 'provider' | 'ollamaUrl' | 'shortcut' | 'hideOnBlur'>> & {
  models?: Partial<Record<ProviderId, string>>;
};

export interface ConfirmRequest {
  id: string;
  tool: string;
  description: string;
}

export type ChatEvent =
  | { type: 'tool'; name: string; summary: string }
  | { type: 'confirm'; request: ConfirmRequest };

export interface ChatResult {
  ok: boolean;
  text: string;
  error?: string;
}
