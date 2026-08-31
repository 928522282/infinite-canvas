import { spawn } from "node:child_process";

import type { CanvasAgentConfig } from "./config.js";

export const DEFAULT_CANVAS_SITE_URL = "https://canvas.best/";

export type ConnectorLaunchOptions = {
    open: boolean;
    siteUrl: string;
    mode: "new" | "recent" | "choose";
};

/** Read the small public launcher contract used by the Windows connector shortcut. */
export function connectorLaunchOptions(args: string[], env: NodeJS.ProcessEnv = process.env): ConnectorLaunchOptions {
    const value = (name: string) => {
        const index = args.indexOf(name);
        return index >= 0 ? args[index + 1] || "" : args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
    };
    const mode = value("--mode");
    return {
        open: args.includes("--open"),
        siteUrl: value("--site") || env.INFINITE_CANVAS_SITE_URL || DEFAULT_CANVAS_SITE_URL,
        mode: mode === "new" || mode === "choose" ? mode : "recent",
    };
}

/** Keep credentials in the fragment so they are not sent to the hosted site or stored in server logs. */
export function connectorSiteUrl(siteUrl: string, config: CanvasAgentConfig, mode: ConnectorLaunchOptions["mode"]) {
    const url = new URL("/canvas", siteUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("在线画布地址必须使用 HTTPS");
    url.searchParams.set("mode", mode);
    url.hash = new URLSearchParams({ agentUrl: config.url, agentToken: config.token }).toString();
    return url.toString();
}

export async function agentIsRunning(config: CanvasAgentConfig) {
    try {
        const response = await fetch(`${config.url.replace(/\/$/, "")}/health`);
        return response.ok;
    } catch {
        return false;
    }
}

export async function stopRunningAgent(config: CanvasAgentConfig) {
    try {
        const response = await fetch(`${config.url.replace(/\/$/, "")}/connector/stop`, { method: "POST", headers: { "x-canvas-agent-token": config.token } });
        return response.ok;
    } catch {
        return false;
    }
}

/** Open the hosted canvas without invoking a shell that could reinterpret URL characters. */
export function openConnectorSite(url: string) {
    const command = process.platform === "win32" ? "rundll32.exe" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => undefined);
    child.unref();
}
