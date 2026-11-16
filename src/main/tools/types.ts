import type { ToolSpec } from '../../shared/types';

/**
 * Tudo que toca o sistema operacional passa por esta interface. Em produção é implementada com Electron
 * (src/main/platform.ts); nos testes, por um fake. Isso mantém as ferramentas testáveis e auditáveis.
 */
export interface Platform {
  readonly os: NodeJS.Platform;
  openExternal(url: string): Promise<void>;
  notify(title: string, body: string): void;
  writeClipboard(text: string): void;
  lockWorkStation(): Promise<void>;
  /** Inicia um executável SEM shell (sem interpretação de argumentos). */
  launch(exe: string, args: string[]): Promise<void>;
}

export interface ToolContext {
  platform: Platform;
  now(): Date;
  /** Agenda uma função; retorna função de cancelamento. Injetável para testes. */
  schedule(ms: number, fn: () => void): () => void;
}

export interface Tool {
  spec: ToolSpec;
  /**
   * Retorna a descrição legível da ação se ela EXIGE confirmação do usuário (ação sensível/irreversível),
   * ou null se pode rodar direto. Recebe os argumentos já validados pela própria ferramenta.
   */
  needsConfirm?(args: Record<string, unknown>): string | null;
  /** Executa e devolve o texto que será mostrado ao modelo. Deve lançar Error com mensagem clara em args inválidos. */
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

export function argString(args: Record<string, unknown>, key: string, maxLen = 2000): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Parâmetro "${key}" é obrigatório (texto).`);
  if (v.length > maxLen) throw new Error(`Parâmetro "${key}" é grande demais (máx. ${maxLen} caracteres).`);
  return v.trim();
}

export function argNumber(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error(`Parâmetro "${key}" é obrigatório (número).`);
  return n;
}
