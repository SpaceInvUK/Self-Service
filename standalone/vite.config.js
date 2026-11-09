// Builds cAssistAI-offline.html: the whole app in one file, no server needed.
import { defineConfig } from "vite";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const here = import.meta.dirname;

export default defineConfig({
  root: here,
  publicDir: false,
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    outDir: resolve(here, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  plugins: [
    {
      name: "logo-inline",
      transform(code, id) {
        if (id.endsWith("main.jsx"))
          return code.replaceAll('"/cassis.png"', "window.__CASSIS_LOGO__");
      },
    },
    {
      name: "single-file",
      closeBundle() {
        const dist = resolve(here, "dist");
        let html = readFileSync(resolve(dist, "index.html"), "utf8");
        html = html.replace(
          /<script type="module" crossorigin src="\.?\/?([^"]+)"><\/script>/,
          (_, f) =>
            `<script type="module">${readFileSync(resolve(dist, f), "utf8").replace(/<\/script/gi, "<\\/script")}</script>`,
        );
        html = html.replace(
          /<link rel="stylesheet" crossorigin href="\.?\/?([^"]+)">/,
          (_, f) => `<style>${readFileSync(resolve(dist, f), "utf8")}</style>`,
        );
        writeFileSync(resolve(here, "../cAssistAI-offline.html"), html);
        rmSync(dist, { recursive: true, force: true });
      },
    },
  ],
  base: "./",
});
