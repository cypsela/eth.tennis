import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function injectShellAssets(): Plugin {
  return {
    name: "inject-shell-assets",
    config() {
      const manifestPath = resolve(
        __dirname,
        "dist/.vite/manifest.json",
      );
      if (!existsSync(manifestPath)) {
        throw new Error(
          `SW build requires ${manifestPath} — run \`vite build\` (main config) first.`,
        );
      }
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
        string,
        { file?: string; css?: string[] }
      >;
      const assets = new Set<string>();
      for (const entry of Object.values(manifest)) {
        if (entry.file) assets.add("/" + entry.file);
        for (const c of entry.css ?? []) assets.add("/" + c);
      }
      return {
        define: {
          "__SHELL_ASSETS__": JSON.stringify([...assets]),
          "__BYPASS_PREFIXES__": JSON.stringify([]),
        },
      };
    },
  };
}

export default defineConfig({
  plugins: [injectShellAssets()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/sw.ts"),
      formats: ["es"],
      fileName: () => "gw-sw.js",
    },
    rollupOptions: {
      output: {
        entryFileNames: "gw-sw.js",
        inlineDynamicImports: true,
      },
    },
  },
});
