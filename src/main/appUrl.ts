/**
 * Protocolo customizado `app://` que serve a UI (substitui o `file://`, ver ADR-012).
 * Módulo PURO (sem Electron) para ser testável: decide quais URLs são servidas e com qual MIME.
 */

export const APP_SCHEME = 'app';
export const APP_HOST = 'ui';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
/** URL da página principal; também é a única origem aceita nos handlers de IPC. */
export const RENDERER_URL = `${APP_ORIGIN}/index.html`;

/** Lista fechada de arquivos servidos (caminho da URL → arquivo em dist/renderer + MIME). */
const ASSETS: Readonly<Record<string, { file: string; mime: string }>> = {
  '/index.html': { file: 'index.html', mime: 'text/html; charset=utf-8' },
  '/renderer.js': { file: 'renderer.js', mime: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', mime: 'text/css; charset=utf-8' },
};

export interface ResolvedAsset {
  file: string;
  mime: string;
}

/**
 * Converte uma URL de requisição em um arquivo permitido, ou `null` (⇒ 404).
 * Só `app://ui/<arquivo da lista>`; nada de subpastas, `..`, outros hosts ou esquemas.
 */
export function resolveAppRequest(rawUrl: string): ResolvedAsset | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== `${APP_SCHEME}:` || u.hostname !== APP_HOST) return null;
  if (u.username || u.password || u.port) return null;
  // esquemas não-"special" podem produzir pathname vazio para "app://ui"
  const pathname = u.pathname === '/' || u.pathname === '' ? '/index.html' : u.pathname;
  return Object.hasOwn(ASSETS, pathname) ? (ASSETS[pathname] ?? null) : null;
}

/** CSP enviada também como cabeçalho (além do <meta>), para valer mesmo se o HTML for alterado. */
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
