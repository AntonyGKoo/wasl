import { defineConfig } from "@playwright/test";
import path from "node:path";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: "",
      OPENAI_API_KEY: "",
      GOOGLE_CLOUD_VISION_API_KEY: "",
      WASL_DATA_DIR: path.resolve(`.wasl-data-e2e-${Date.now()}`),
      APP_URL: "http://127.0.0.1:3100",
    },
  },
});
