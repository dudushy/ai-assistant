import fs from 'node:fs/promises';
import path from 'node:path';
import { protocol } from 'electron';
import { APP_SCHEME, CSP, resolveAppRequest } from './appUrl';

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');

/** Deve ser chamado ANTES de `app.whenReady()`. `standard`+`secure` fazem o app:// se comportar como uma origem web normal (CSP 'self', módulos ES). */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true } }]);
}

/** Registra o handler que serve a UI. Lê com `fs` (compatível com asar) e só da lista fechada de `resolveAppRequest`. */
export function serveApp(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const asset = resolveAppRequest(request.url);
    if (!asset) return new Response('Não encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    try {
      const body = await fs.readFile(path.join(RENDERER_DIR, asset.file));
      return new Response(new Uint8Array(body), {
        headers: {
          'content-type': asset.mime,
          'content-security-policy': CSP,
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
        },
      });
    } catch {
      return new Response('Erro ao ler o arquivo', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  });
}
