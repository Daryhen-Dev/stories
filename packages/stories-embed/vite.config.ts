import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

const source = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

/** Emits importable ESM entries and the browser-only script-tag bundle separately. */
export default defineConfig(({ mode }) => {
  if (mode === "iife") {
    return {
      build: {
        cssCodeSplit: false,
        emptyOutDir: false,
        lib: {
          entry: source("./src/register.ts"),
          fileName: () => "stories-viewer.iife.js",
          formats: ["iife"],
          name: "StoriesEmbed",
        },
        outDir: "dist",
        sourcemap: false,
      },
    };
  }

  return {
    build: {
      cssCodeSplit: false,
      emptyOutDir: true,
      lib: {
        entry: {
          index: source("./src/index.ts"),
          register: source("./src/register.ts"),
        },
        formats: ["es"],
      },
      outDir: "dist",
      rollupOptions: {
        external: (id) => id === "lit" || id.startsWith("lit/"),
        output: {
          chunkFileNames: "chunks/[name]-[hash].js",
          entryFileNames: "[name].js",
        },
      },
      sourcemap: false,
    },
  };
});
