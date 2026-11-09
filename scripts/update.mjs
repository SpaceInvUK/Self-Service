// Self-update from GitHub: keeps this folder on the latest commit of the
// configured branch. .env, data/ and node_modules are not in the download,
// so the key, conversations and WhatsApp sessions are preserved.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = "SpaceInvUK/Self-Service";
export const defaultBranch = "claude/amazing-fermi-nrlr4z";
const launcher = "Iniciar cAssistAI.bat";

export async function update(root, env = {}) {
  // Developer checkouts update with git; UPDATE=off disables it.
  if (existsSync(join(root, ".git")) || env.UPDATE === "off") return false;
  const branch = env.UPDATE_BRANCH || defaultBranch;
  const versionFile = join(root, ".cassist-version");
  const installed = existsSync(versionFile)
    ? readFileSync(versionFile, "utf8").trim()
    : "";
  let sha;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`,
      {
        headers: {
          Accept: "application/vnd.github.sha",
          "User-Agent": "cAssistAI",
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!r.ok) throw Error(`GitHub respondeu HTTP ${r.status}`);
    sha = (await r.text()).trim();
    if (!/^[0-9a-f]{40}$/.test(sha))
      throw Error("resposta inesperada do GitHub");
  } catch (e) {
    console.log(
      `(Não foi possível procurar atualização agora: ${e.message}. Seguindo com a versão atual.)`,
    );
    return false;
  }
  if (sha === installed) {
    console.log(`Versão em dia (${sha.slice(0, 7)}).`);
    return false;
  }
  console.log(`\n>> Atualizando o cAssistAI para a versão ${sha.slice(0, 7)}…`);
  const file = join(tmpdir(), `cassistai-${sha}.tar.gz`);
  try {
    const r = await fetch(`https://codeload.github.com/${repo}/tar.gz/${sha}`, {
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) throw Error(`download HTTP ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    // The running .bat is left alone: Windows reads it while it runs.
    const t = spawnSync(
      "tar",
      [
        "-xzf",
        file,
        "--strip-components=1",
        "--exclude",
        `*/${launcher}`,
        "-C",
        root,
      ],
      { stdio: "inherit" },
    );
    if (t.status !== 0) throw Error("falha ao extrair os arquivos");
    writeFileSync(versionFile, sha + "\n");
    console.log("Atualizado.");
    return true;
  } catch (e) {
    console.log(
      `(Atualização não concluída: ${e.message}. Seguindo com a versão atual.)`,
    );
    return false;
  } finally {
    rmSync(file, { force: true });
  }
}
