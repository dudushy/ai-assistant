import { spawn } from 'node:child_process';
import { Notification, clipboard, shell } from 'electron';
import type { SecretCodec } from './settings';
import type { Platform } from './tools/types';
import { safeStorage } from 'electron';

/** Implementação real (Electron/Windows) da interface Platform. */
export const electronPlatform: Platform = {
  os: process.platform,

  async openExternal(url) {
    await shell.openExternal(url);
  },

  notify(title, body) {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  },

  writeClipboard(text) {
    clipboard.writeText(text);
  },

  async lockWorkStation() {
    if (process.platform !== 'win32') throw new Error('Bloquear a tela só está disponível no Windows por enquanto.');
    await this.launch('rundll32.exe', ['user32.dll,LockWorkStation']);
  },

  launch(exe, args) {
    return new Promise<void>((resolve, reject) => {
      // sem shell: os argumentos nunca são interpretados como comando
      const child = spawn(exe, args, { detached: true, stdio: 'ignore', shell: false });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  },
};

let encryptionAvailable = false;
export const electronCodec: SecretCodec = {
  available: () => encryptionAvailable,
  async init() {
    encryptionAvailable = await safeStorage.isAsyncEncryptionAvailable();
  },
  encrypt: (s) => safeStorage.encryptStringAsync(s),
  async decrypt(b) {
    return (await safeStorage.decryptStringAsync(b)).result;
  },
};
