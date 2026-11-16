import path from 'node:path';
import { type BrowserWindow, Menu, Notification, Tray, app, globalShortcut, nativeImage } from 'electron';
import { registerIpc } from './ipc';
import { electronCodec, electronPlatform } from './platform';
import { registerAppScheme, serveApp } from './protocol';
import { DEFAULT_SHORTCUT, SettingsStore } from './settings';
import { createMainWindow, showWindow, toggleWindow } from './window';

const DEV = process.argv.includes('--dev');

// a UI é servida por app://ui/ (ADR-012); o esquema precisa ser registrado antes do app ficar pronto
registerAppScheme();

// uma única instância: abrir de novo apenas mostra a barra
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win: BrowserWindow | null = null;
  let tray: Tray | null = null;
  let registeredShortcut = '';

  app.on('second-instance', () => {
    if (win) showWindow(win);
  });

  // ficar rodando na bandeja mesmo sem janelas visíveis
  app.on('window-all-closed', () => {});

  void app.whenReady().then(async () => {
    await electronCodec.init();
    serveApp();
    const store = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), electronCodec);

    win = createMainWindow({ devTools: DEV, shouldHideOnBlur: () => store.getPublic().hideOnBlur });

    const applyShortcut = () => {
      const wanted = store.getPublic().shortcut;
      if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
      registeredShortcut = '';
      const tryRegister = (acc: string) => {
        try {
          return globalShortcut.register(acc, () => win && toggleWindow(win));
        } catch {
          return false;
        }
      };
      if (tryRegister(wanted)) registeredShortcut = wanted;
      else if (wanted !== DEFAULT_SHORTCUT && tryRegister(DEFAULT_SHORTCUT)) registeredShortcut = DEFAULT_SHORTCUT;
      else if (Notification.isSupported()) {
        new Notification({
          title: 'AI Assistant',
          body: `Não consegui registrar o atalho "${wanted}". Use o ícone da bandeja ou troque o atalho nas configurações.`,
        }).show();
      }
    };

    registerIpc({
      getWindow: () => win!,
      store,
      platform: electronPlatform,
      onSettingsChanged: applyShortcut,
    });
    applyShortcut();

    // dentro do app.asar o caminho relativo continua válido (assets/icon.png é incluído no pacote)
    const icon = nativeImage
      .createFromPath(path.join(__dirname, '..', '..', 'assets', 'icon.png'))
      .resize({ width: 24, height: 24 });
    tray = new Tray(icon);
    tray.setToolTip('AI Assistant');
    const buildMenu = () =>
      Menu.buildFromTemplate([
        { label: 'Mostrar / ocultar', click: () => win && toggleWindow(win) },
        {
          label: 'Iniciar com o Windows',
          type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
          },
        },
        { type: 'separator' },
        { label: 'Sair', click: () => app.quit() },
      ]);
    tray.setContextMenu(buildMenu());
    tray.on('click', () => win && toggleWindow(win));
    tray.on('right-click', () => tray?.setContextMenu(buildMenu()));

    if (!process.argv.includes('--hidden')) showWindow(win);
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
