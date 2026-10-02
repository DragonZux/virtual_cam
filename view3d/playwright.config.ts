import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5185",
    // Use the installed Chrome on Windows; bundled Chromium elsewhere.
    channel: process.platform === "win32" ? "chrome" : undefined,
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5185 --strictPort",
    url: "http://127.0.0.1:5185",
    reuseExistingServer: !process.env.CI,
  },
});
