import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { toolDescriptions, toolInputSchemas, toolNames, type ToolName } from "../canvas/schemas.js";
import { AGENT_PROMPT, loadConfig, type CanvasAgentConfig, VERSION } from "../config.js";
import { connectorSiteUrl, DEFAULT_CANVAS_SITE_URL } from "../connector.js";

type CanvasAgentToolResponse = { ok?: boolean; result?: unknown; error?: string };
type McpServerOptions = { instructions?: string; version?: string };

/** 启动通过标准输入输出通信的 MCP 服务。 */
export async function startMcpServer(options: McpServerOptions = {}) {
    const config = loadConfig(true);
    const server = new McpServer({ name: "canvas-agent", version: options.version || VERSION }, { instructions: options.instructions || AGENT_PROMPT });
    server.registerTool("site_get_connection_url", {
        description: "获取 Infinite Canvas 网页连接地址。首次打开画布或网页未连接时调用；地址中的本地连接 token 位于 URL fragment，网页读取后会立即清除。",
        inputSchema: {
            mode: z.enum(["new", "recent", "choose"]).optional(),
            siteUrl: z.string().url().optional(),
        },
    }, async ({ mode = "new", siteUrl = DEFAULT_CANVAS_SITE_URL }) => ({
        content: [{ type: "text" as const, text: JSON.stringify({ url: connectorSiteUrl(siteUrl, config, mode) }) }],
    }));
    toolNames.forEach((name) => registerCanvasTool(server, config, name));
    await server.connect(new StdioServerTransport());
}

/** 向 MCP Server 注册单个 Canvas Agent 工具。 */
function registerCanvasTool(server: McpServer, config: CanvasAgentConfig, name: ToolName) {
    const schema = toolInputSchemas[name];
    server.registerTool(name, { description: toolDescriptions[name], inputSchema: schema.shape }, async (input: unknown) => {
        const result = await postCanvasAgentTool(config, name, schema.parse(input));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    });
}

/** 将 MCP 工具调用转发到本地 Canvas Agent HTTP 服务。 */
async function postCanvasAgentTool(config: CanvasAgentConfig, name: ToolName, input: unknown) {
    const res = await fetch(`${config.url}/api/tools`, { method: "POST", headers: { "content-type": "application/json", "x-canvas-agent-token": config.token }, body: JSON.stringify({ name, input }) });
    const body = (await res.json()) as CanvasAgentToolResponse;
    if (!body.ok) throw new Error(body.error || "tool call failed");
    return body.result;
}
