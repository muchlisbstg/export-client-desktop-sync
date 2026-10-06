import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(rootDir, "electron/main.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(rootDir, "electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: rootDir,
    resolve: {
      alias: {
        "@": resolve(rootDir, "src"),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(rootDir, "index.html"),
      },
    },
    plugins: [react()],
  },
});
