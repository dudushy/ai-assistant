import fs from 'node:fs';
import path from 'node:path';
import {
  PROVIDERS,
  PROVIDER_IDS,
  type ProviderId,
  type PublicSettings,
  type SettingsPatch,
} from '../shared/types';

/** Abstração da criptografia de segredos (Electron `safeStorage` em produção; fake nos testes). */
export interface SecretCodec {
  /** Disponibilidade (em cache; chame init() uma vez após o app ficar pronto). */
  available(): boolean;
  init(): Promise<void>;
  encrypt(plain: string): Promise<Buffer>;
  decrypt(data: Buffer): Promise<string>;
}

interface StoredSettings {
  provider: ProviderId;
  models: Record<ProviderId, string>;
  ollamaUrl: string;
  shortcut: string;
  hideOnBlur: boolean;
  /** chaves de API criptografadas (base64). Nunca em texto puro. */
  keys: Partial<Record<ProviderId, string>>;
}

export const DEFAULT_SHORTCUT = 'Control+Alt+Space';

function defaults(): StoredSettings {
  return {
    provider: 'groq',
    models: Object.fromEntries(PROVIDER_IDS.map((id) => [id, PROVIDERS[id].defaultModel])) as Record<ProviderId, string>,
    ollamaUrl: 'http://127.0.0.1:11434',
    shortcut: DEFAULT_SHORTCUT,
    hideOnBlur: true,
    keys: {},
  };
}

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === 'string' && (PROVIDER_IDS as readonly string[]).includes(v);
}

export function validateOllamaUrl(v: string): string {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error('URL do Ollama inválida.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('A URL do Ollama deve ser http(s).');
  if (u.username || u.password) throw new Error('A URL do Ollama não pode ter usuário/senha.');
  return u.origin;
}

export class SettingsStore {
  private data: StoredSettings = defaults();

  constructor(
    private readonly file: string,
    private readonly codec: SecretCodec,
  ) {
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<StoredSettings>;
      const d = defaults();
      this.data = {
        provider: isProviderId(raw.provider) ? raw.provider : d.provider,
        models: { ...d.models, ...(typeof raw.models === 'object' && raw.models ? raw.models : {}) },
        ollamaUrl: typeof raw.ollamaUrl === 'string' ? raw.ollamaUrl : d.ollamaUrl,
        shortcut: typeof raw.shortcut === 'string' && raw.shortcut ? raw.shortcut : d.shortcut,
        hideOnBlur: typeof raw.hideOnBlur === 'boolean' ? raw.hideOnBlur : d.hideOnBlur,
        keys: typeof raw.keys === 'object' && raw.keys ? raw.keys : {},
      };
    } catch {
      this.data = defaults(); // arquivo ausente/corrompido: começa do zero
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, this.file); // escrita atômica
  }

  getPublic(): PublicSettings {
    return {
      provider: this.data.provider,
      models: { ...this.data.models },
      ollamaUrl: this.data.ollamaUrl,
      hasKey: Object.fromEntries(PROVIDER_IDS.map((id) => [id, Boolean(this.data.keys[id])])) as Record<
        ProviderId,
        boolean
      >,
      shortcut: this.data.shortcut,
      hideOnBlur: this.data.hideOnBlur,
      encryptionAvailable: this.codec.available(),
      providers: PROVIDER_IDS.map((id) => PROVIDERS[id]),
    };
  }

  async getApiKey(id: ProviderId): Promise<string> {
    const enc = this.data.keys[id];
    if (!enc) return '';
    try {
      return await this.codec.decrypt(Buffer.from(enc, 'base64'));
    } catch {
      return ''; // não conseguiu decifrar (outro usuário/máquina): trata como sem chave
    }
  }

  patch(p: SettingsPatch): PublicSettings {
    if (p.provider !== undefined) {
      if (!isProviderId(p.provider)) throw new Error('Provedor inválido.');
      this.data.provider = p.provider;
    }
    if (p.models) {
      for (const [id, model] of Object.entries(p.models)) {
        if (!isProviderId(id)) throw new Error('Provedor inválido.');
        if (typeof model !== 'string' || model.length > 100) throw new Error('Nome de modelo inválido.');
        this.data.models[id] = model.trim() || PROVIDERS[id].defaultModel;
      }
    }
    if (p.ollamaUrl !== undefined) this.data.ollamaUrl = validateOllamaUrl(p.ollamaUrl);
    if (p.shortcut !== undefined) {
      if (typeof p.shortcut !== 'string' || !p.shortcut.trim() || p.shortcut.length > 60) throw new Error('Atalho inválido.');
      this.data.shortcut = p.shortcut.trim();
    }
    if (p.hideOnBlur !== undefined) this.data.hideOnBlur = Boolean(p.hideOnBlur);
    this.save();
    return this.getPublic();
  }

  async setKey(id: ProviderId, key: string): Promise<PublicSettings> {
    if (!isProviderId(id)) throw new Error('Provedor inválido.');
    const k = key.trim();
    if (!k) {
      delete this.data.keys[id];
    } else {
      if (k.length > 500) throw new Error('Chave grande demais.');
      if (!this.codec.available()) {
        throw new Error('A criptografia do sistema não está disponível; por segurança a chave NÃO foi salva.');
      }
      this.data.keys[id] = (await this.codec.encrypt(k)).toString('base64');
    }
    this.save();
    return this.getPublic();
  }
}
