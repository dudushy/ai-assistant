import { randomUUID } from 'node:crypto';
import { type BrowserWindow, type IpcMainInvokeEvent, ipcMain } from 'electron';
import type { IpcInvoke } from '../shared/ipc';
import type { ChatEvent, ChatResult, ModelsResult } from '../shared/types';
import { Agent } from './ai/agent';
import { withModelRecovery } from './ai/modelRecovery';
import { filterChatModels } from './ai/models';
import { ProviderError } from './ai/provider';
import { createProvider } from './ai/registry';
import { isProviderId, type SettingsStore } from './settings';
import { BUILTIN_TOOLS } from './tools/builtin';
import type { Platform, ToolContext } from './tools/types';
import { RENDERER_URL } from './appUrl';
import { resizeWindow } from './window';

const MAX_MESSAGE_CHARS = 4000;
const CONFIRM_TIMEOUT_MS = 60_000;

export interface IpcDeps {
  getWindow(): BrowserWindow;
  store: SettingsStore;
  platform: Platform;
  /** chamado depois que as configurações mudam (ex.: re-registrar atalho). */
  onSettingsChanged(): void;
}

type Handlers = { [K in keyof IpcInvoke]: (e: IpcMainInvokeEvent, ...a: Parameters<IpcInvoke[K]>) => unknown };

export function registerIpc(deps: IpcDeps): void {
  const { store, platform } = deps;

  const ctx: ToolContext = {
    platform,
    now: () => new Date(),
    schedule: (ms, fn) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    },
  };

  const pendingConfirms = new Map<string, (ok: boolean) => void>();
  let abort: AbortController | null = null;
  const emit = (e: ChatEvent) => deps.getWindow().webContents.send('chat:event', e);

  const agent = new Agent({
    // provider real é montado a cada envio (ver chat:send); este placeholder nunca é usado
    provider: { id: 'ollama', chat: () => Promise.reject(new Error('provider não configurado')), listModels: async () => [] },
    tools: BUILTIN_TOOLS,
    ctx,
    confirm: async () => false,
    onEvent: emit,
  });

  const confirm = (tool: string, description: string) =>
    new Promise<boolean>((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(() => finish(false), CONFIRM_TIMEOUT_MS);
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        pendingConfirms.delete(id);
        resolve(ok);
      };
      pendingConfirms.set(id, finish);
      deps.getWindow().show(); // garante que o usuário veja o pedido
      emit({ type: 'confirm', request: { id, tool, description } });
    });

  /** Monta o provedor da configuração atual, opcionalmente com outro modelo. */
  const buildProvider = async (model?: string) => {
    const s = store.getPublic();
    return createProvider(s.provider, {
      apiKey: await store.getApiKey(s.provider),
      model: model ?? s.models[s.provider],
      ollamaUrl: s.ollamaUrl,
    });
  };

  /** Executa com recuperação automática quando o modelo configurado deixou de existir (404). */
  const withRecovery = <T>(run: (p: Awaited<ReturnType<typeof buildProvider>>) => Promise<T>) => {
    const s = store.getPublic();
    return withModelRecovery({
      providerId: s.provider,
      currentModel: s.models[s.provider],
      build: buildProvider,
      run,
      saveModel: (m) => void store.patch({ models: { [s.provider]: m } }),
    });
  };

  const handlers: Handlers = {
    'chat:send': async (_e, text): Promise<ChatResult> => {
      if (typeof text !== 'string' || !text.trim()) return { ok: false, text: '', error: 'Mensagem vazia.' };
      if (text.length > MAX_MESSAGE_CHARS) return { ok: false, text: '', error: 'Mensagem grande demais.' };
      if (abort) return { ok: false, text: '', error: 'Ainda estou processando o pedido anterior.' };
      abort = new AbortController();
      try {
        const signal = abort.signal;
        const r = await withRecovery((provider) => {
          agent.setDeps({ provider, tools: BUILTIN_TOOLS, ctx, confirm, onEvent: emit });
          return agent.send(text.trim(), signal);
        });
        return { ok: true, text: r.value, ...(r.notice ? { notice: r.notice } : {}) };
      } catch (e) {
        const msg = e instanceof ProviderError || e instanceof Error ? e.message : String(e);
        return { ok: false, text: '', error: msg };
      } finally {
        abort = null;
      }
    },
    'chat:reset': () => {
      agent.reset();
    },
    'chat:cancel': () => {
      abort?.abort();
      for (const finish of [...pendingConfirms.values()]) finish(false);
    },
    'confirm:respond': (_e, id, approved) => {
      if (typeof id === 'string') pendingConfirms.get(id)?.(approved === true);
    },
    'settings:get': () => store.getPublic(),
    'settings:set': (_e, patch) => {
      const r = store.patch(patch);
      deps.onSettingsChanged();
      return r;
    },
    'settings:setKey': async (_e, provider, key) => {
      if (!isProviderId(provider) || typeof key !== 'string') throw new Error('Parâmetros inválidos.');
      return await store.setKey(provider, key);
    },
    'settings:test': async (): Promise<ChatResult> => {
      try {
        const r = await withRecovery((provider) =>
          provider.chat({ system: 'Responda apenas com a palavra OK.', messages: [{ role: 'user', content: 'ping' }], tools: [] }),
        );
        return { ok: true, text: r.value.text.trim().slice(0, 100) || 'OK', ...(r.notice ? { notice: r.notice } : {}) };
      } catch (e) {
        return { ok: false, text: '', error: e instanceof Error ? e.message : String(e) };
      }
    },
    'settings:models': async (): Promise<ModelsResult> => {
      try {
        const models = filterChatModels(await (await buildProvider()).listModels());
        return { ok: true, models };
      } catch (e) {
        return { ok: false, models: [], error: e instanceof Error ? e.message : String(e) };
      }
    },
    'ui:resize': (_e, height) => {
      if (typeof height === 'number' && Number.isFinite(height)) resizeWindow(deps.getWindow(), height);
    },
    'ui:hide': () => {
      deps.getWindow().hide();
    },
  };

  for (const [channel, handler] of Object.entries(handlers) as [keyof IpcInvoke, (e: IpcMainInvokeEvent, ...a: never[]) => unknown][]) {
    ipcMain.handle(channel, (e, ...args) => {
      // só aceita chamadas vindas da nossa própria página
      if (e.senderFrame?.url !== RENDERER_URL) throw new Error('Origem não autorizada.');
      return (handler as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(e, ...args);
    });
  }
}
