#!/usr/bin/env node
import { agentIsRunning, connectorLaunchOptions, connectorSiteUrl, openConnectorSite, stopRunningAgent } from "./connector.js";
import { loadConfig } from "./config.js";
import { startHttpServer } from "./server/http.js";
import { startMcpServer } from "./server/mcp.js";

if (process.argv[2] === "mcp") await startMcpServer();
else if (process.argv[2] === "stop") {
    const stopped = await stopRunningAgent(loadConfig());
    console.log(stopped ? "Infinite Canvas Connector stopped." : "Infinite Canvas Connector is not running.");
}
else {
    const options = connectorLaunchOptions(process.argv.slice(2));
    const config = loadConfig(true);
    if (await agentIsRunning(config)) {
        console.log(`Infinite Canvas Agent is already running at ${config.url}`);
        if (options.open) openConnectorSite(connectorSiteUrl(options.siteUrl, config, options.mode));
    } else {
        startHttpServer({
            onListening: options.open ? (activeConfig) => openConnectorSite(connectorSiteUrl(options.siteUrl, activeConfig, options.mode)) : undefined,
        });
    }
}
