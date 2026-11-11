import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command:
      "node --input-type=module -e \"import {rmSync} from 'node:fs'; rmSync('/tmp/cassistai-e2e',{recursive:true,force:true})\" && NODE_ENV=production BATCH_MS=0 PORT=3100 DATA_DIR=/tmp/cassistai-e2e node server/index.mjs",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
