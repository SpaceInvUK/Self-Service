// One-click local start: prepares everything on first run, starts the central
// with the WhatsApp connector on this computer and opens the browser.
// Used by "Iniciar cAssistAI.bat"; also works with: node scripts/local-start.mjs
import { spawn, spawnSync, exec } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
process.chdir(root);
const envPath = resolve(".env");
const say = (m) => console.log(`\n>> ${m}`);

function readEnv() {
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}
function writeEnv(env) {
  const lines = [
    "# Criado pelo Iniciar cAssistAI. Pode editar com o Bloco de Notas.",
    ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
  ];
  writeFileSync(envPath, lines.join("\n") + "\n", { mode: 0o600 });
}

// 0. Get the latest version from GitHub, then restart with the new code.
if (!process.env.CASSIST_UPDATED) {
  const { update } = await import("./update.mjs");
  if (await update(root, readEnv())) {
    const again = spawnSync(process.execPath, [process.argv[1]], {
      stdio: "inherit",
      env: { ...process.env, CASSIST_UPDATED: "1" },
    });
    process.exit(again.status ?? 0);
  }
}

// 1. Configuration (.env) with local mode and Groq.
const env = {
  HOST: "127.0.0.1",
  PORT: "3000",
  DATA_DIR: "./data",
  LOCAL_CONNECTORS: "true",
  AI_BASE_URL: "https://api.groq.com/openai/v1",
  AI_MODEL: "auto",
  AI_API_KEY: "",
  ...readEnv(),
};
if (!env.AI_API_KEY && process.stdin.isTTY && !process.env.CASSIST_SKIP_KEY) {
  console.log(
    "\nChave da IA (Groq). Crie grátis em https://console.groq.com/keys" +
      "\nCole a chave aqui (clique com o botão direito para colar) e aperte Enter." +
      "\nPara usar sem IA por enquanto, só aperte Enter.",
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const key = (await rl.question("Chave: ")).trim();
  rl.close();
  if (/^[\w-]{10,200}$/.test(key)) env.AI_API_KEY = key;
  else if (key)
    console.log("Isso não parece uma chave válida; seguindo sem IA.");
}
writeEnv(env);

// 2. Dependencies, only when missing or when the lock file changed.
const npm = (args, cwd) => {
  const r = spawnSync("npm", args, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error("\nFalha ao instalar. Verifique a internet e tente de novo.");
    process.exit(1);
  }
};
const lockHash = (dir) =>
  createHash("sha256")
    .update(readFileSync(join(dir, "package-lock.json")))
    .digest("hex");
for (const dir of [root, resolve("connector")]) {
  const marker = join(dir, "node_modules", ".cassist-lock");
  const current = lockHash(dir);
  if (!existsSync(marker) || readFileSync(marker, "utf8") !== current) {
    say(
      `Instalando componentes (${dir === root ? "central" : "WhatsApp"}). Só na primeira vez…`,
    );
    npm(["ci", "--omit=dev", "--no-audit", "--no-fund"], dir);
    writeFileSync(marker, current);
  }
}

// 3. Build the panel when the source is newer than the last build.
const newest = (p) => {
  const s = statSync(p);
  return s.isDirectory()
    ? Math.max(s.mtimeMs, ...readdirSync(p).map((f) => newest(join(p, f))))
    : s.mtimeMs;
};
const built = resolve("dist/index.html");
if (!existsSync(built) || newest(resolve("src")) > statSync(built).mtimeMs) {
  say("Preparando o painel…");
  npm(["run", "build"], root);
}

// 4. Start the central (it starts the WhatsApp connectors) and open the browser.
const url = `http://127.0.0.1:${env.PORT}`;
say(`Ligando o cAssistAI em ${url}`);
console.log("   Deixe esta janela aberta. Para desligar, feche a janela.\n");
const server = spawn(
  process.execPath,
  [
    "--disable-warning=ExperimentalWarning",
    "--env-file=.env",
    "server/start.mjs",
  ],
  { stdio: "inherit" },
);
server.on("exit", (code) => {
  if (code)
    console.error(
      `\nO cAssistAI parou (código ${code}). Veja a mensagem acima.`,
    );
  process.exit(code ?? 0);
});
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(s, () => server.kill(s));

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    if ((await fetch(url + "/api/health")).ok) {
      if (!process.env.CASSIST_NO_BROWSER) {
        const open =
          process.platform === "win32"
            ? `start "" "${url}"`
            : process.platform === "darwin"
              ? `open "${url}"`
              : `xdg-open "${url}"`;
        exec(open, () => {});
      }
      console.log(`Painel aberto no navegador: ${url}`);
      break;
    }
  } catch {
    /* still starting */
  }
}
