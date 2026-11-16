import type { ChatMessage, ProviderId, ToolCall, ToolSpec } from '../../shared/types';

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface Provider {
  readonly id: ProviderId;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  ollamaUrl: string;
}

const DEFAULT_TIMEOUT_MS = 90_000;

/** POST JSON com timeout + cancelamento. Nunca inclui chaves na mensagem de erro. */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.any(signals),
    });
  } catch (e) {
    if (signal?.aborted) throw new ProviderError('Cancelado.');
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError') throw new ProviderError('A IA demorou demais para responder (timeout).');
    throw new ProviderError(`Não consegui conectar ao serviço de IA: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new ProviderError(`Erro ${res.status} do provedor: ${extractErrorMessage(text)}`, res.status);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError('Resposta inválida (não é JSON) do provedor.');
  }
}

export function extractErrorMessage(raw: string): string {
  try {
    const j = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    const e = j.error;
    const msg = typeof e === 'string' ? e : (e?.message ?? j.message);
    if (msg) return msg.slice(0, 300);
  } catch {
    /* corpo não era JSON */
  }
  return raw.slice(0, 300);
}

/** Converte `arguments` (string JSON ou objeto) em objeto; qualquer coisa inválida vira {}. */
export function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const v: unknown = JSON.parse(raw);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* ignora */
    }
  }
  return {};
}
