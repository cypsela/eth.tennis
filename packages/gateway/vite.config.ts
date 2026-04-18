import { build as esbuildBuild } from "esbuild";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

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
  plugins: [serveSwInDev()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
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
