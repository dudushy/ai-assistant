// Gera assets/icon.png e assets/icon.ico (256x256, círculo com gradiente) sem dependências. Rode: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const N = 256;
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0; // filtro "none"
  for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - (N - 1) / 2, y - (N - 1) / 2);
    const inside = d <= N / 2 - 1;
    const o = y * (N * 4 + 1) + 1 + x * 4;
    raw[o] = Math.round(100 + (x / N) * 40);
    raw[o + 1] = Math.round(120 + (y / N) * 40);
    raw[o + 2] = 255;
    raw[o + 3] = inside ? 255 : 0;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; // profundidade
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'icon.png'), png);

// ICO com o PNG embutido (formato aceito desde o Windows Vista); largura/altura 0 = 256
const dir = Buffer.alloc(22);
dir.writeUInt16LE(1, 2); // tipo: ícone
dir.writeUInt16LE(1, 4); // quantidade de imagens
dir.writeUInt16LE(1, 10); // planos
dir.writeUInt16LE(32, 12); // bits por pixel
dir.writeUInt32LE(png.length, 14); // tamanho dos dados
dir.writeUInt32LE(22, 18); // deslocamento dos dados
writeFileSync(join(out, 'icon.ico'), Buffer.concat([dir, png]));
console.log('assets/icon.png e icon.ico gerados', png.length, 'bytes');
