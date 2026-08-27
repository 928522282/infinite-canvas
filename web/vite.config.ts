import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sites } from "@openai/sites-vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

// Expose /plugins/index.json with local plugin files from public/plugins.
// The frontend can discover and list them when enabled; development reads the directory live, while builds emit a static registry.
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

export default defineConfig(async () => {
    const { cloudflare } = await import("@cloudflare/vite-plugin");

    return {
        base: process.env.VITE_BASE || "/",
        plugins: [
            react(),
            localPluginsManifest(),
            sites(),
            cloudflare({
                viteEnvironment: { name: "server" },
                config: {
                    name: "infinite-canvas-workbench",
                    main: "./worker.ts",
                    compatibility_date: "2026-05-22",
                    assets: {
                        binding: "ASSETS",
                        not_found_handling: "single-page-application",
                    },
                },
            }),
        ],
        resolve: {
            alias: {
                "@": resolve(webDir, "src"),
            },
        },
        define: {
            __APP_VERSION__: JSON.stringify(localVersion),
            __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
        },
    };
});
