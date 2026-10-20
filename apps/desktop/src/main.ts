import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  type Display,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  screen,
  session,
  shell,
} from 'electron';
import { ControlEvent, PointerMove } from '@houston/protocol';
import { ControlDeclined, ControlSession } from './control';
import packageJson from '../package.json';
import { strings } from './i18n';
import { allowedServerUrl, parseDeepLink, TrustedServers } from './servers';

const PERMISSIONS = new Set([
  'media',
  'display-capture',
  'notifications',
  'clipboard-sanitized-write',
]);

// Separate profiles, e.g. for tests or several installations side by side.
if (process.env.HOUSTON_DESKTOP_USER_DATA) {
  app.setPath('userData', process.env.HOUSTON_DESKTOP_USER_DATA);
}

// One instance: links clicked later go to the running app.
if (!app.requestSingleInstanceLock()) app.quit();

if (process.defaultApp && process.argv[1]) {
  // Development (electron .): register with the script path.
  app.setAsDefaultProtocolClient('houston', process.execPath, [
    join(process.cwd(), process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient('houston');
}

let window: BrowserWindow | null = null;
let control: ControlSession | null = null;
let servers: TrustedServers;
let sharedDisplayId: number | null = null;
/** A link that arrived before the window existed. */
let pendingUrl: URL | null = null;

const staticDir = join(__dirname, '..', 'static');
const text = () => strings(app.getLocale());

function trusted(origin: string | undefined) {
  return Boolean(origin && servers.has(origin));
}

function fromTrusted(event: IpcMainEvent | IpcMainInvokeEvent) {
  return event.sender === window?.webContents && trusted(event.senderFrame?.origin);
}

function sharedDisplay(): Display {
  const displays = screen.getAllDisplays();
  return (
    displays.find((d) => d.id === sharedDisplayId) ??
    (window ? screen.getDisplayMatching(window.getBounds()) : screen.getPrimaryDisplay())
  );
}

/** Asks before connecting to a server for the first time; links can come from anywhere. */
async function open(url: URL) {
  if (!window) {
    pendingUrl = url;
    return;
  }
  if (!servers.has(url.origin)) {
    const t = text();
    const { response } = await dialog.showMessageBox(window, {
      type: 'question',
      title: t.trustTitle,
      message: t.trustMessage(url.host),
      detail: t.trustDetail,
      buttons: [t.trustYes, t.trustNo],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;
  }
  servers.add(url.origin);
  control?.stop();
  await window.loadURL(url.toString());
  if (window.isMinimized()) window.restore();
  window.focus();
}

function handleLink(raw: string | undefined) {
  const url = raw ? parseDeepLink(raw) : null;
  if (url) void open(url);
}

function createWindow() {
  window = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 420,
    minHeight: 500,
    title: 'Houston',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const { webContents } = window;
  // Stay on trusted Houston servers; anything else opens in the normal browser.
  webContents.on('will-navigate', (event, target) => {
    if (!trusted(new URL(target).origin)) {
      event.preventDefault();
      const url = allowedServerUrl(target);
      if (url || target.startsWith('http')) void shell.openExternal(target);
    }
  });
  webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.on('closed', () => {
    control?.stop();
    window = null;
  });

  // HOUSTON_DESKTOP_URL (development, tests) wins over the server built into the app;
  // both are trusted without asking.
  const configured = allowedServerUrl(process.env.HOUSTON_DESKTOP_URL ?? '');
  if (configured) servers.add(configured.origin);
  const builtIn = allowedServerUrl(packageJson.houston?.defaultServer ?? '');
  if (builtIn) servers.allow(builtIn.origin);
  const start =
    pendingUrl ??
    configured ??
    (servers.lastOrigin ? allowedServerUrl(servers.lastOrigin) : null) ??
    builtIn;
  pendingUrl = null;
  if (start) void open(start);
  else void window.loadFile(join(staticDir, 'start.html'));
}

function setUpSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(trusted(new URL(details.requestingUrl).origin) && PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler(
    (_contents, permission, origin) => trusted(origin) && PERMISSIONS.has(permission),
  );

  // Share the whole display the Houston window is on; control maps onto that display.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!trusted(request.securityOrigin ? new URL(request.securityOrigin).origin : undefined)) {
      callback({});
      return;
    }
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const display = window
      ? screen.getDisplayMatching(window.getBounds())
      : screen.getPrimaryDisplay();
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
    if (!source) {
      callback({});
      return;
    }
    sharedDisplayId = Number(source.display_id) || display.id;
    callback({ video: source });
  });
}

function setUpIpc() {
  ipcMain.on('bridge:trusted', (event) => {
    event.returnValue = fromTrusted(event);
  });
  ipcMain.on('bridge:version', (event) => {
    event.returnValue = app.getVersion();
  });
  ipcMain.on('control:mode', (event) => {
    event.returnValue = fromTrusted(event) && control ? control.mode() : 'none';
  });
  ipcMain.handle('control:start', async (event, mode: unknown) => {
    if (!fromTrusted(event) || !control || (mode !== 'full' && mode !== 'overlay')) return 'failed';
    try {
      await control.start(mode, window);
      return 'started';
    } catch (error) {
      if (error instanceof ControlDeclined) return 'declined';
      console.error('[houston] control failed to start', error);
      return 'failed';
    }
  });
  ipcMain.on('control:stop', (event) => {
    if (fromTrusted(event)) control?.stop();
  });
  ipcMain.on('control:input', (event, raw: unknown) => {
    const parsed = ControlEvent.safeParse(raw);
    if (fromTrusted(event) && parsed.success) control?.input(parsed.data);
  });
  ipcMain.on('control:pointer', (event, raw: unknown) => {
    const parsed = PointerMove.safeParse(raw);
    if (fromTrusted(event) && parsed.success) control?.pointer(parsed.data);
  });
  // From the app's own Stop bar (a local page, not the server's).
  ipcMain.on('control:stop-by-user', (event) => {
    if (event.senderFrame?.url.startsWith('file:')) control?.stopByUser();
  });
}

app.on('second-instance', (_event, argv) => {
  handleLink(argv.find((arg) => arg.startsWith('houston:')));
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

// macOS delivers links through this event, also on launch.
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleLink(url);
});

app.whenReady().then(() => {
  servers = new TrustedServers(join(app.getPath('userData'), 'servers.json'));
  control = new ControlSession({
    strings: text(),
    staticDir,
    preload: join(__dirname, 'overlay-preload.js'),
    sharedDisplay,
    onModeChange: () => window?.webContents.send('control:mode-changed'),
    onStoppedByUser: () => window?.webContents.send('control:stopped'),
  });
  setUpSession();
  setUpIpc();
  const link = process.argv.find((arg) => arg.startsWith('houston:'));
  if (link) pendingUrl = parseDeepLink(link);
  createWindow();

  app.on('activate', () => {
    if (!window) createWindow();
  });
});

app.on('window-all-closed', () => {
  control?.dispose();
  app.quit();
});
