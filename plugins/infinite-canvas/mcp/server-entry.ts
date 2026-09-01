import instructions from "../../../canvas-agent/agent-instructions.md";
import { agentIsRunning } from "../../../canvas-agent/src/connector.js";
import { loadConfig } from "../../../canvas-agent/src/config.js";
import { startHttpServer } from "../../../canvas-agent/src/server/http.js";
import { startMcpServer } from "../../../canvas-agent/src/server/mcp.js";

const config = loadConfig(true);
if (!(await agentIsRunning(config))) startHttpServer({ quiet: true });
await startMcpServer({ instructions, version: "0.6.0" });
