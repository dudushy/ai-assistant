// Copia arquivos estáticos do renderer (html/css) para dist/ — sem bundler.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'renderer');
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'styles.css']) cpSync(join(root, 'src', 'renderer', f), join(out, f));
console.log('static files copied');
