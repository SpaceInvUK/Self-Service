// Local mode: the central starts one WhatsApp connector per number on this
// same computer, so nobody has to copy tokens or open a terminal.
// Tokens stay in DATA_DIR (never in Git); sessions in DATA_DIR/whatsapp/<id>.
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";

export const localConnectorsEnabled = process.env.LOCAL_CONNECTORS === "true";
const dataDir = resolve(process.env.DATA_DIR || "./data");
const registryPath = resolve(dataDir, "local-connectors.json");
const connectorDir = resolve("connector");
const running = new Map();

const load = () => {
  try {
    return JSON.parse(readFileSync(registryPath, "utf8"));
  } catch {
    return {};
  }
};
const store = (registry) => {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(registryPath, JSON.stringify(registry), { mode: 0o600 });
};

function launch(id, token, centralUrl, attempt = 0) {
  if (!existsSync(resolve(connectorDir, "node_modules"))) {
    console.error(
      "Conector local: dependências ausentes. Execute npm ci dentro de connector.",
    );
    return;
  }
  const child = spawn(process.execPath, ["index.mjs"], {
    cwd: connectorDir,
    env: {
      ...process.env,
      CENTRAL_URL: centralUrl,
      CONNECTOR_TOKEN: token,
      SESSION_DIR: resolve(dataDir, "whatsapp", id),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const entry = { child, stopping: false };
  running.set(id, entry);
  const log = (chunk) =>
    String(chunk)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => console.log(`[WhatsApp ${id.slice(0, 6)}] ${line}`));
  child.stdout.on("data", log);
  child.stderr.on("data", log);
  child.on("exit", (code) => {
    if (running.get(id) === entry) running.delete(id);
    if (entry.stopping || !load()[id]) return;
    // Restart after crashes with growing delay; a revoked token keeps failing and backs off.
    const delay = Math.min(60000, 3000 * 2 ** attempt);
    console.log(
      `[WhatsApp ${id.slice(0, 6)}] conector parou (código ${code}); reiniciando em ${delay / 1000}s.`,
    );
    setTimeout(() => {
      if (!running.has(id) && load()[id])
        launch(id, token, centralUrl, Math.min(attempt + 1, 5));
    }, delay);
  });
}

export function startLocalConnector(id, token, centralUrl) {
  if (!localConnectorsEnabled) return false;
  const registry = load();
  registry[id] = token;
  store(registry);
  launch(id, token, centralUrl);
  return true;
}

export function stopLocalConnector(id, { forgetSession = true } = {}) {
  if (!localConnectorsEnabled) return;
  const registry = load();
  delete registry[id];
  store(registry);
  const entry = running.get(id);
  if (entry) {
    entry.stopping = true;
    entry.child.kill();
    running.delete(id);
  }
  if (forgetSession)
    setTimeout(
      () =>
        rmSync(resolve(dataDir, "whatsapp", id), {
          recursive: true,
          force: true,
        }),
      1500,
    );
}

export function resumeLocalConnectors(existingIds, centralUrl) {
  if (!localConnectorsEnabled) return;
  const registry = load();
  for (const [id, token] of Object.entries(registry)) {
    if (existingIds.includes(id)) launch(id, token, centralUrl);
    else delete registry[id];
  }
  store(registry);
}

const stopAll = () => {
  for (const entry of running.values()) {
    entry.stopping = true;
    entry.child.kill();
  }
};
process.on("exit", stopAll);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => {
    stopAll();
    process.exit(0);
  });
