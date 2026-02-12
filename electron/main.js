import { app, BrowserWindow, Menu } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import isDev from "electron-is-dev";
import fs from "fs";
import http from "http";
import { spawn } from "child_process";

function createCleanNextEnv(baseEnv) {
  // If we inherit Electron-specific env into the Next child, Next can end up
  // re-launching the Electron binary (process.execPath points at Dashboard.exe)
  // which looks like an "npm install typescript" cmd popup + blank window +
  // recursive app starts.
  const env = { ...baseEnv };

  // Strip Electron-run-as-node behavior and anything likely to confuse a plain Node server.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;

  // Ensure the child runs the embedded Node runtime, not the Electron app binary.
  // In production, Dashboard.exe is Electron; next standalone server must run with electron.exe + ELECTRON_RUN_AS_NODE=1.
  env.ELECTRON_RUN_AS_NODE = "1";

  // Keep Next focused on running already-built output
  env.NODE_ENV = "production";
  env.NEXT_TELEMETRY_DISABLED = env.NEXT_TELEMETRY_DISABLED || "1";

  return env;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getPaths = () => {
  if (isDev) {
    return {
      appRoot: path.join(__dirname, ".."),
      // in dev, Next server is started separately via `next dev`
      standaloneRoot: path.join(__dirname, "..", ".next", "standalone"),
      hasStandalone: false,
    };
  }

  // electron-builder config puts Next output into:
  //   <resources>/.next/standalone
  // NOT under app.asar/app.asar.unpacked.
  const resourcesPath = process.resourcesPath;
  const resourcesStandaloneRoot = path.join(
    resourcesPath,
    ".next",
    "standalone",
  );
  const resourcesStaticRoot = path.join(resourcesPath, ".next", "static");

  const hasStandalone = fs.existsSync(
    path.join(resourcesStandaloneRoot, "server.js"),
  );

  // Keep appRoot as the Electron app path (where node_modules/electron code lives),
  // but use resourcesStandaloneRoot for Next runtime.
  const appRoot = app.getAppPath();

  return {
    appRoot,
    standaloneRoot: resourcesStandaloneRoot,
    staticRoot: resourcesStaticRoot,
    hasStandalone,
  };
};

let nextServerPromise = null;

function logStartup(label, extra = {}) {
  const payload = {
    label,
    isDev,
    platform: process.platform,
    execPath: process.execPath,
    argv0: process.argv0,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    cwd: process.cwd(),
    comspec: process.env.COMSPEC || process.env.ComSpec,
    pathHead: (process.env.PATH || "").split(";").slice(0, 5),
    ...extra,
  };
  // Keep logging simple and synchronous for early startup debugging
  console.log("[startup]", JSON.stringify(payload, null, 2));
}

function ensureWindowsShellEnv() {
  if (process.platform !== "win32") {
    return;
  }

  // In packaged apps, child_process spawn failures (cmd.exe ENOENT) are often caused by
  // ComSpec/COMSPEC being unset/invalid or System32 missing from PATH.
  const systemRoot =
    process.env.SystemRoot || process.env.SYSTEMROOT || "C:\\Windows";

  const system32 = path.join(systemRoot, "System32");
  const cmdPath = path.join(system32, "cmd.exe");

  if (fs.existsSync(cmdPath)) {
    process.env.ComSpec = cmdPath;
    process.env.COMSPEC = cmdPath;
  }

  const currentPath = process.env.PATH || "";
  const pathParts = currentPath.split(";").filter(Boolean);
  const hasSystem32 = pathParts.some(
    (p) => p.trim().toLowerCase() === system32.toLowerCase(),
  );

  if (!hasSystem32) {
    process.env.PATH = `${system32};${currentPath}`;
  }

  // Prevent any tooling from trying to "helpfully" install TypeScript on first run.
  // If a dependency tries to run "npm" implicitly, it will commonly shell out via cmd.exe.
  process.env.NPM_CONFIG_FUND = "false";
  process.env.NPM_CONFIG_AUDIT = "false";
  process.env.npm_config_fund = "false";
  process.env.npm_config_audit = "false";
}

async function ensureDatabaseUrl() {
  const { appRoot } = getPaths();
  const dbPath = path.join(app.getPath("userData"), "dev.db");

  if (!fs.existsSync(dbPath)) {
    // When packaged, extraResources are placed under process.resourcesPath.
    // Prefer that location, then fall back to appRoot.
    const bundledDbCandidates = [
      path.join(process.resourcesPath, "dev.db"),
      path.join(appRoot, "dev.db"),
    ];

    const bundledDb = bundledDbCandidates.find((p) => fs.existsSync(p));

    if (bundledDb) {
      fs.copyFileSync(bundledDb, dbPath);
    } else {
      fs.writeFileSync(dbPath, "");
    }
  }

  process.env.DATABASE_URL = `file:${dbPath}`;
  return dbPath;
}

async function startNextServer() {
  if (isDev) {
    return { port: 3000 };
  }

  if (nextServerPromise) {
    return nextServerPromise;
  }

  nextServerPromise = (async () => {
    ensureWindowsShellEnv();

    const { appRoot, standaloneRoot, staticRoot, hasStandalone } = getPaths();
    const port = Number(process.env.PORT) || 3000;

    logStartup("prod-start", {
      appRoot,
      standaloneRoot,
      staticRoot,
      hasStandalone,
      port,
    });

    // Prefer Next "standalone" server in production. Importing `next` at runtime from inside
    // Electron packaging can cause it to attempt to install/build things (e.g., TypeScript),
    // which manifests as a cmd popup asking to "npm install typescript" and a blank window.
    if (hasStandalone) {
      const serverEntry = path.join(standaloneRoot, "server.js");

      if (!fs.existsSync(serverEntry)) {
        throw new Error(
          `Next standalone server entry not found: ${serverEntry}. Ensure Next is built with output:"standalone" and that resources/.next/standalone is packaged.`,
        );
      }

      // IMPORTANT:
      // - In a packaged Electron app, `process.execPath` is Dashboard.exe (Electron), not Node.
      // - Next standalone server MUST run using Electron's embedded Node via `ELECTRON_RUN_AS_NODE=1`,
      //   otherwise it can recursively relaunch the app and/or trigger "npm install typescript" prompts.
      const child = spawn(process.execPath, [serverEntry], {
        cwd: standaloneRoot,
        env: {
          ...createCleanNextEnv(process.env),
          PORT: String(port),
        },
        stdio: "pipe",
        windowsHide: true,
      });

      child.stdout.on("data", (buf) =>
        console.log("[next-standalone:stdout]", String(buf).trimEnd()),
      );
      child.stderr.on("data", (buf) =>
        console.error("[next-standalone:stderr]", String(buf).trimEnd()),
      );

      await new Promise((resolve, reject) => {
        let settled = false;

        child.once("error", (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        });

        child.once("exit", (code) => {
          if (settled) return;
          settled = true;
          reject(
            new Error(`Next standalone server exited early (code=${code})`),
          );
        });

        // Standalone doesn't offer a built-in "ready" signal; wait briefly then proceed.
        setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve(null);
        }, 800);
      });

      return {
        server: { close: () => child.kill() },
        port,
      };
    }

    // Fallback: run Next via programmatic API (less reliable in packaged apps)
    const next = (await import("next")).default;
    const nextApp = next({ dev: false, dir: appRoot });
    const handle = nextApp.getRequestHandler();
    await nextApp.prepare();

    const server = http.createServer((req, res) => handle(req, res));

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, () => resolve(null));
    });

    return { server, port };
  })();

  return nextServerPromise;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.setMenuBarVisibility(false);

  // Helpful when you get a "blank page": surface renderer load errors.
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[renderer] did-fail-load", { code, desc, url });
  });

  if (isDev) {
    await win.loadURL("http://localhost:3000");
    win.webContents.openDevTools();
    return;
  }

  await ensureDatabaseUrl();
  const { port } = await startNextServer();
  await win.loadURL(`http://localhost:${port}`);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextServerPromise) {
    nextServerPromise.then(({ server }) => {
      if (server) {
        server.close();
      }
    });
  }
});
