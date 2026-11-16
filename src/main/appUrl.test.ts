import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RENDERER_URL, resolveAppRequest } from './appUrl';

describe('resolveAppRequest', () => {
  it('serve só os 3 arquivos da UI, com o MIME certo', () => {
    assert.deepEqual(resolveAppRequest(RENDERER_URL), { file: 'index.html', mime: 'text/html; charset=utf-8' });
    assert.equal(resolveAppRequest('app://ui/')?.file, 'index.html');
    assert.equal(resolveAppRequest('app://ui')?.file, 'index.html');
    assert.equal(resolveAppRequest('app://ui/renderer.js')?.mime, 'text/javascript; charset=utf-8');
    assert.equal(resolveAppRequest('app://ui/styles.css?v=1#x')?.file, 'styles.css');
  });

  it('bloqueia path traversal, subpastas, sourcemaps e arquivos fora da lista', () => {
    for (const bad of [
      'app://ui/../main/main.js',
      'app://ui/%2e%2e/main/main.js',
      'app://ui/%2E%2E%2Fmain%2Fmain.js',
      'app://ui/..%5Cmain%5Cmain.js',
      'app://ui/renderer.js.map',
      'app://ui/sub/index.html',
      'app://ui//index.html',
      'app://ui/INDEX.HTML',
      'app://ui/index.html/',
      'app://ui/__proto__',
      'app://ui/constructor',
      'app://ui/package.json',
    ]) {
      assert.equal(resolveAppRequest(bad), null, bad);
    }
  });

  it('bloqueia outros hosts, portas, credenciais e esquemas', () => {
    for (const bad of [
      'app://evil/index.html',
      'app://ui:8080/index.html',
      'app://user:pw@ui/index.html',
      'file:///C:/Windows/win.ini',
      'https://ui/index.html',
      'http://ui/index.html',
      'javascript:alert(1)',
      'não é url',
      '',
    ]) {
      assert.equal(resolveAppRequest(bad), null, bad);
    }
  });
});
