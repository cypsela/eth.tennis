import { build as esbuildBuild } from "esbuild";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

function inlineStyles(): Plugin {
  const inlined = new Set<string>();
  return {
    name: "inline-styles",
    apply: "build",
    enforce: "post",
    generateBundle(_opts, bundle) {
      const htmlAsset = bundle["index.html"];
      if (!htmlAsset || htmlAsset.type !== "asset") return;
      let html = String(htmlAsset.source);

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "asset" || !fileName.endsWith(".css")) continue;
        const css = String(chunk.source);
        const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const linkPattern = new RegExp(
          `<link[^>]*href=["']/?${escaped}["'][^>]*>`,
          "g",
        );
        html = html.replace(linkPattern, `<style>${css}</style>`);
        delete bundle[fileName];
        inlined.add(fileName);
      }

      htmlAsset.source = html;
    },
    writeBundle(opts) {
      if (!opts.dir || inlined.size === 0) return;
      const manifestPath = resolve(opts.dir, ".vite/manifest.json");
      if (!existsSync(manifestPath)) return;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
        string,
        { css?: string[] }
      >;
      let changed = false;
      for (const entry of Object.values(manifest)) {
        if (!entry.css) continue;
        const kept = entry.css.filter((c) => !inlined.has(c));
        if (kept.length === entry.css.length) continue;
        changed = true;
        if (kept.length === 0) delete entry.css;
        else entry.css = kept;
      }
      if (changed) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      inlined.clear();
    },
  };
}

function serveSwInDev(): Plugin {
  let env: Record<string, string> = {};
  return {
    name: "gw-sw-dev",
    apply: "serve",
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir ?? process.cwd(), "VITE_");
    },
    configureServer(server) {
      server.middlewares.use("/gw-sw.js", async (_req, res, next) => {
        try {
          const result = await esbuildBuild({
            entryPoints: [resolve(__dirname, "src/sw.ts")],
            bundle: true,
            format: "esm",
            target: "es2022",
            write: false,
            platform: "browser",
            mainFields: ["browser", "module", "main"],
            conditions: ["browser", "import", "module"],
            define: {
              "import.meta.env.VITE_GATEWAY_DOMAIN": JSON.stringify(
                env["VITE_GATEWAY_DOMAIN"] ?? process.env["VITE_GATEWAY_DOMAIN"]
                  ?? "localhost",
              ),
              "import.meta.env.VITE_RPC_URL": JSON.stringify(
                env["VITE_RPC_URL"] ?? process.env["VITE_RPC_URL"]
                  ?? "https://cloudflare-eth.com",
              ),
              "import.meta.env.VITE_TEST_CONTENT_GATEWAY": JSON.stringify(
                env["VITE_TEST_CONTENT_GATEWAY"]
                  ?? process.env["VITE_TEST_CONTENT_GATEWAY"] ?? "",
              ),
              "process.env.NODE_ENV": JSON.stringify("development"),
              "__SHELL_ASSETS__": JSON.stringify([]),
              "__BYPASS_PREFIXES__": JSON.stringify([
                "/@",
                "/node_modules/",
                "/src/",
              ]),
            },
          });
          const code = result.outputFiles[0]?.text ?? "";
          res.setHeader(
            "Content-Type",
            "application/javascript; charset=utf-8",
          );
          res.setHeader("Service-Worker-Allowed", "/");
          res.setHeader("Cache-Control", "no-cache");
          res.end(code);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [inlineStyles(), serveSwInDev()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        bootstrap: resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
