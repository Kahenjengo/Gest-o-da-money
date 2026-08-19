const electron = require('electron');

if (typeof electron !== 'object' || !electron.app) {
  console.log('[financeiq] Executado fora do Electron (web mode). A iniciar servidor web...');
  require('./server');
  return;
}

const { app, BrowserWindow, Menu, shell } = electron;
const path = require('path');

let mainWindow;
let server;

app.whenReady().then(() => {
  process.env.ELECTRON_MODE = '1';
  process.env.DB_PATH = path.join(app.getPath('userData'), 'financeiq.db');
  process.env.SESSION_DB_PATH = path.join(app.getPath('userData'), 'sessions.db');
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'financeiq-desktop-secret-change-me';

  const expressApp = require('./server');

  const PORT = process.env.PORT || 3000;
  server = expressApp.listen(PORT, '127.0.0.1', () => {
    console.log(`FinanceIQ Desktop rodando em http://localhost:${PORT}`);
    createWindow(PORT);
  });

  server.on('error', (err) => {
    console.error('Erro no servidor:', err);
  });
});

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'FinanceIQ',
    show: false,
    backgroundColor: '#0a0c1c',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('window-all-closed', () => {
  if (server) {
    server.close();
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const PORT = process.env.PORT || 3000;
    createWindow(PORT);
  }
});
