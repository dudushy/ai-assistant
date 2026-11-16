import os from 'node:os';
import { type Tool, argNumber, argString } from './types';

/** Valida uma URL para abrir no navegador: só http(s), sem credenciais embutidas, tamanho limitado. */
export function validateWebUrl(raw: string): URL {
  if (raw.length > 2048) throw new Error('URL grande demais.');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('URL inválida.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Só é permitido abrir links http(s).');
  if (u.username || u.password) throw new Error('URLs com usuário/senha embutidos não são permitidas.');
  return u;
}

/** Apps que o assistente pode abrir. Lista fechada de propósito: o modelo NUNCA escolhe um caminho/comando. */
export const APP_ALLOWLIST: Record<string, { label: string; exe: string; args: string[] }> = {
  calculator: { label: 'Calculadora', exe: 'calc.exe', args: [] },
  notepad: { label: 'Bloco de Notas', exe: 'notepad.exe', args: [] },
  explorer: { label: 'Explorador de Arquivos', exe: 'explorer.exe', args: [] },
  paint: { label: 'Paint', exe: 'mspaint.exe', args: [] },
  task_manager: { label: 'Gerenciador de Tarefas', exe: 'taskmgr.exe', args: [] },
  settings: { label: 'Configurações do Windows', exe: 'explorer.exe', args: ['ms-settings:'] },
};

const MAX_TIMER_MINUTES = 24 * 60;

export const getDatetime: Tool = {
  spec: {
    name: 'get_datetime',
    description: 'Retorna a data e a hora atuais do computador do usuário.',
    parameters: { type: 'object', properties: {} },
  },
  async run(_args, ctx) {
    const d = ctx.now();
    return `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}, ${d.toLocaleTimeString('pt-BR')}`;
  },
};

export const systemInfo: Tool = {
  spec: {
    name: 'system_info',
    description: 'Retorna informações básicas do computador: sistema, CPU, memória e tempo ligado.',
    parameters: { type: 'object', properties: {} },
  },
  async run() {
    const gb = (n: number) => (n / 1024 ** 3).toFixed(1);
    const cpus = os.cpus();
    return [
      `Sistema: ${os.type()} ${os.release()} (${os.arch()})`,
      `CPU: ${cpus[0]?.model ?? 'desconhecida'} (${cpus.length} threads)`,
      `Memória: ${gb(os.totalmem() - os.freemem())} GB em uso de ${gb(os.totalmem())} GB`,
      `Ligado há: ${(os.uptime() / 3600).toFixed(1)} horas`,
    ].join('\n');
  },
};

export const openUrl: Tool = {
  spec: {
    name: 'open_url',
    description: 'Abre um link http(s) no navegador padrão do usuário.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Endereço completo, começando com https://' } },
      required: ['url'],
    },
  },
  async run(args, ctx) {
    const u = validateWebUrl(argString(args, 'url', 2048));
    await ctx.platform.openExternal(u.toString());
    return `Abri ${u.hostname} no navegador.`;
  },
};

export const webSearch: Tool = {
  spec: {
    name: 'web_search',
    description: 'Abre uma pesquisa na web (DuckDuckGo) no navegador do usuário. Não lê os resultados.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Texto da pesquisa' } },
      required: ['query'],
    },
  },
  async run(args, ctx) {
    const q = argString(args, 'query', 300);
    await ctx.platform.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`);
    return `Abri a pesquisa por "${q}" no navegador.`;
  },
};

export const openApp: Tool = {
  spec: {
    name: 'open_app',
    description: 'Abre um aplicativo do Windows da lista permitida.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Qual aplicativo abrir', enum: Object.keys(APP_ALLOWLIST) },
      },
      required: ['app'],
    },
  },
  async run(args, ctx) {
    const key = argString(args, 'app', 50);
    const entry = Object.hasOwn(APP_ALLOWLIST, key) ? APP_ALLOWLIST[key] : undefined;
    if (!entry) throw new Error(`Aplicativo "${key}" não é permitido. Opções: ${Object.keys(APP_ALLOWLIST).join(', ')}.`);
    if (ctx.platform.os !== 'win32') throw new Error('Abrir aplicativos só está disponível no Windows por enquanto.');
    await ctx.platform.launch(entry.exe, entry.args);
    return `Abri ${entry.label}.`;
  },
};

export const setTimer: Tool = {
  spec: {
    name: 'set_timer',
    description: 'Cria um lembrete/timer que avisa com uma notificação do sistema quando o tempo acabar.',
    parameters: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Em quantos minutos avisar (pode ser fracionado, ex.: 0.5)' },
        label: { type: 'string', description: 'Texto do lembrete' },
      },
      required: ['minutes'],
    },
  },
  async run(args, ctx) {
    const minutes = argNumber(args, 'minutes');
    if (minutes <= 0 || minutes > MAX_TIMER_MINUTES) throw new Error(`Os minutos devem estar entre 0 e ${MAX_TIMER_MINUTES}.`);
    const label = typeof args['label'] === 'string' && args['label'].trim() ? args['label'].trim().slice(0, 200) : 'Timer';
    ctx.schedule(Math.round(minutes * 60_000), () => ctx.platform.notify('⏰ Lembrete', label));
    return `Combinado! Aviso "${label}" em ${minutes} min.`;
  },
};

export const lockPc: Tool = {
  spec: {
    name: 'lock_pc',
    description: 'Bloqueia o computador (tela de login). Exige confirmação do usuário.',
    parameters: { type: 'object', properties: {} },
  },
  needsConfirm: () => 'Bloquear o computador agora',
  async run(_args, ctx) {
    await ctx.platform.lockWorkStation();
    return 'Computador bloqueado.';
  },
};

export const clipboardWrite: Tool = {
  spec: {
    name: 'clipboard_write',
    description: 'Copia um texto para a área de transferência do usuário. Exige confirmação (substitui o conteúdo atual).',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Texto a copiar' } },
      required: ['text'],
    },
  },
  needsConfirm: (args) => {
    const t = typeof args['text'] === 'string' ? args['text'] : '';
    return `Copiar para a área de transferência: "${t.slice(0, 80)}${t.length > 80 ? '…' : ''}"`;
  },
  async run(args, ctx) {
    ctx.platform.writeClipboard(argString(args, 'text', 20_000));
    return 'Copiado para a área de transferência.';
  },
};

export const BUILTIN_TOOLS: Tool[] = [
  getDatetime,
  systemInfo,
  openUrl,
  webSearch,
  openApp,
  setTimer,
  lockPc,
  clipboardWrite,
];
