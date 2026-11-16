// Smoke test de ponta a ponta: inicia o app (oculto), conecta no DevTools Protocol e confirma que
//   1) a página carregou por app://ui/index.html, 2) o preload expôs window.api (e nada de Node),
//   3) o IPC aceitou a origem (as configurações chegaram e preencheram o seletor), 4) a CSP está ativa.
// Uso:  node scripts/smoke.mjs <executável> [args...]
//   dev:         node scripts/smoke.mjs node_modules/electron/dist/electron.exe .
//   empacotado:  node scripts/smoke.mjs "release/win-unpacked/AI Assistant.exe"
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [exe, ...extra] = process.argv.slice(2);
if (!exe) {
  console.error('uso: node scripts/smoke.mjs <executável> [args...]');
  process.exit(2);
}
const port = 9300 + Math.floor(Math.random() * 400);
// pasta de dados temporária: isola do app real do usuário (outra trava de instância, outras configurações)
const dataDir = mkdtempSync(join(tmpdir(), 'ai-assistant-smoke-'));
const child = spawn(exe, [...extra, '--hidden', `--remote-debugging-port=${port}`, `--user-data-dir=${dataDir}`], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stop = () => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
};

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {
      /* ainda subindo */
    }
    await sleep(250);
  }
  throw new Error('página não apareceu no DevTools Protocol em 15 s');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(String(m.data));
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  };
  const ready = new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('falha no WebSocket do DevTools'));
  });
  return {
    ready,
    eval: (expression) =>
      new Promise((res) => {
        const myId = ++id;
        pending.set(myId, res);
        ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
      }),
    close: () => ws.close(),
  };
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  const page = await findPage();
  check('página carregada por app://ui/index.html', page.url === 'app://ui/index.html', page.url);
  const c = cdp(page.webSocketDebuggerUrl);
  await c.ready;

  // espera o renderer buscar as configurações via IPC e montar o seletor de provedores
  let state;
  for (let i = 0; i < 40; i++) {
    const r = await c.eval(`(() => { try { return JSON.stringify({
      api: typeof window.api,
      require: typeof require,
      process: typeof process,
      title: document.title,
      providers: document.getElementById('set-provider')?.options.length ?? 0,
      selected: document.getElementById('set-provider')?.value ?? null,
      hasInput: !!document.getElementById('input'),
      styled: getComputedStyle(document.getElementById('bar')).borderRadius !== '0px'
    }); } catch (e) { return JSON.stringify({ providers: 0, error: String(e) }); } })()`);
    state = JSON.parse(r.result?.result?.value ?? '{"providers":0}');
    if (state.providers > 0) break;
    await sleep(250);
  }
  check('window.api exposto pelo preload', state.api === 'object');
  check('sem Node no renderer (require/process indefinidos)', state.require === 'undefined' && state.process === 'undefined');
  check('IPC aceitou a origem e entregou as configurações', state.providers === 4, `${state.providers} provedores, selecionado: ${state.selected}`);
  check('CSS aplicado e campo de entrada presentes', state.hasInput && state.styled);

  const csp = await c.eval(`(async () => {
    let inlineBlocked = false;
    document.addEventListener('securitypolicyviolation', () => { inlineBlocked = true; });
    const s = document.createElement('script'); s.textContent = 'window.__x = 1'; document.head.append(s);
    await new Promise(r => setTimeout(r, 100));
    return JSON.stringify({ inlineBlocked, ran: window.__x === 1 });
  })()`);
  const cspState = JSON.parse(csp.result.result.value);
  check('CSP bloqueia script inline', cspState.inlineBlocked && !cspState.ran);

  const fileLoad = await c.eval(`(async () => { try { await fetch('file:///C:/Windows/win.ini'); return 'permitido'; } catch { return 'bloqueado'; } })()`);
  check('página não consegue ler file://', fileLoad.result.result.value === 'bloqueado');
  c.close();
} catch (e) {
  check('execução do smoke test', false, e instanceof Error ? e.message : String(e));
} finally {
  stop();
  await sleep(500);
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* arquivos ainda em uso: o SO limpa o temp depois */
  }
}

const interesting = log.split('\n').filter((l) => l.trim() && !/Network service|GPU process|gpu_process|network_service/.test(l));
if (interesting.length) console.log('--- saída do app:\n' + interesting.slice(0, 15).join('\n'));
const failed = checks.filter((x) => !x).length;
console.log(failed ? `\nFALHOU: ${failed} verificação(ões)` : '\nOK: todas as verificações passaram');
process.exit(failed ? 1 : 0);
