import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
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
