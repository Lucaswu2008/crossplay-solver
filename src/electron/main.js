import electron from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHttpServer } from "../server.js";

const { app, BrowserWindow, Menu, ipcMain, nativeTheme } = electron;
const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = 4173;
const PORTABLE_STATE_DIR = "CrossplaySolverData";
const STATE_FILE_NAME = "solver-state.json";

let serverContext = null;

function resolveWindowIconPath() {
  const candidates = [];

  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, "icon.ico"));
    candidates.push(path.join(path.dirname(app.getAppPath()), "icon.ico"));
  }

  candidates.push(path.join(process.cwd(), "build", "icon.ico"));
  candidates.push(path.join(app.getAppPath(), "build", "icon.ico"));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveStateDirectory() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, PORTABLE_STATE_DIR);
  }

  return app.getPath("userData");
}

function getStateFilePath() {
  return path.join(resolveStateDirectory(), STATE_FILE_NAME);
}

async function readPersistedAppState() {
  const filePath = getStateFilePath();

  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writePersistedAppState(payload) {
  const filePath = getStateFilePath();
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.tmp`;
  const serialized = JSON.stringify(payload);

  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(tempPath, serialized, "utf8");
  await fsp.rename(tempPath, filePath);
}

function writePersistedAppStateSync(payload) {
  const filePath = getStateFilePath();
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.tmp`;
  const serialized = JSON.stringify(payload);

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(tempPath, serialized, "utf8");
  fs.renameSync(tempPath, filePath);
}

async function ensureLocalServer() {
  if (!serverContext) {
    const { server } = await createHttpServer({
      host: LOCAL_HOST,
      port: LOCAL_PORT,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath
    });

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : LOCAL_PORT;
    serverContext = { server, port };
  }

  return serverContext;
}

async function createMainWindow() {
  const { port } = await ensureLocalServer();
  const windowIconPath = resolveWindowIconPath();

  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 820,
    autoHideMenuBar: true,
    backgroundColor: "#f4f2ed",
    icon: windowIconPath ?? undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), "src", "electron", "preload.cjs")
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  await mainWindow.loadURL(`http://${LOCAL_HOST}:${port}`);
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = "light";
  Menu.setApplicationMenu(null);

  ipcMain.handle("ui:set-theme", (_event, theme) => {
    const resolvedTheme = theme === "dark" ? "dark" : "light";
    nativeTheme.themeSource = resolvedTheme;

    for (const win of BrowserWindow.getAllWindows()) {
      win.setBackgroundColor(resolvedTheme === "dark" ? "#151922" : "#ececec");
    }

    return resolvedTheme;
  });

  ipcMain.handle("state:load", async () => {
    return readPersistedAppState();
  });

  ipcMain.handle("state:save", async (_event, payload) => {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    await writePersistedAppState(payload);
    return true;
  });

  ipcMain.on("state:save-sync", (event, payload) => {
    try {
      if (!payload || typeof payload !== "object") {
        event.returnValue = false;
        return;
      }

      writePersistedAppStateSync(payload);
      event.returnValue = true;
    } catch {
      event.returnValue = false;
    }
  });

  ipcMain.handle("state:path", () => getStateFilePath());

  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  if (serverContext?.server) {
    serverContext.server.close();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
