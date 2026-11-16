import path from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { RENDERER_URL } from './appUrl';

const WIDTH = 680;
export const MIN_HEIGHT = 72;
export const MAX_HEIGHT = 620;
const TOP_MARGIN = 12;


export function createMainWindow(opts: { devTools: boolean; shouldHideOnBlur: () => boolean }): BrowserWindow {
  const win = new BrowserWindow({
    width: WIDTH,
    height: MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: opts.devTools,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');

  // o renderer só exibe a nossa página: nenhuma navegação nem janela nova
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  win.on('blur', () => {
    if (opts.shouldHideOnBlur() && !win.webContents.isDevToolsOpened()) win.hide();
  });

  void win.loadURL(RENDERER_URL);
  return win;
}

export function positionOnActiveDisplay(win: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const wa = display.workArea;
  const [w] = win.getSize();
  const width = w ?? WIDTH;
  win.setPosition(Math.round(wa.x + (wa.width - width) / 2), wa.y + TOP_MARGIN);
}

export function showWindow(win: BrowserWindow): void {
  positionOnActiveDisplay(win);
  win.show();
  win.focus();
  win.webContents.send('ui:shown');
}

export function toggleWindow(win: BrowserWindow): void {
  if (win.isVisible() && win.isFocused()) win.hide();
  else showWindow(win);
}

export function resizeWindow(win: BrowserWindow, height: number): void {
  const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)));
  const [w] = win.getSize();
  const [x, y] = win.getPosition();
  win.setBounds({ x: x ?? 0, y: y ?? 0, width: w ?? WIDTH, height: h });
}
