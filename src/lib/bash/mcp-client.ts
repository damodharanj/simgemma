import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BashSystem } from "./bash-system";

export class McpClientManager {
  private static instance: McpClientManager;
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, any[]> = new Map();
  private initialized = false;

  private constructor() {}

  public static getInstance(): McpClientManager {
    if (!McpClientManager.instance) {
      McpClientManager.instance = new McpClientManager();
    }
    return McpClientManager.instance;
  }

  public async loadConfigAndConnect() {
    if (this.initialized) return;
    this.initialized = true;
    
    // Defer fetching fs to avoid circular dependency loop if early
    const fs = BashSystem.getInstance().fs;
    if (!(await fs.exists("/home/user/mcp.json"))) return;

    try {
      const content = await fs.readFile("/home/user/mcp.json", "utf8");
      const config = JSON.parse(content as string);

      if (config.mcpServers) {
        for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
          const cfg = serverConfig as any;
          if (cfg.url && !this.clients.has(name)) {
             await this.connectServer(name, cfg.url);
          }
        }
      }
    } catch (e: any) {
      console.error("Failed to load or connect MCP config", e);
    }
  }

  public async connectServer(name: string, urlStr: string) {
    if (this.clients.has(name)) {
      console.log(`Server ${name} is already connected. Skipping.`);
      return;
    }
    try {
      const url = new URL(urlStr);
      const client = new Client({ name: "web-bash-client", version: "1.0.0" }, { capabilities: {} });
      
      try {
        const transport = new StreamableHTTPClientTransport(url);
        await client.connect(transport);
        console.log(`Connected to MCP server ${name} using StreamableHTTPClientTransport`);
      } catch (err: any) {
        console.log(`StreamableHTTP transport failed for ${name}, trying SSE transport...`, err);
        const fallbackTransport = new SSEClientTransport(url);
        await client.connect(fallbackTransport);
        console.log(`Connected to MCP server ${name} using SSEClientTransport`);
      }

      this.clients.set(name, client);

      const toolsList = await client.listTools();
      this.tools.set(name, toolsList.tools);
      console.log(`Server ${name} has ${toolsList.tools.length} tools.`);

    } catch (e) {
      console.error(`Failed to connect to MCP server ${name} at ${urlStr}:`, e);
    }
  }

  public async callTool(serverName: string, toolName: string, args: any) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Server ${serverName} not connected.`);

    return await client.callTool({
      name: toolName,
      arguments: args
    });
  }

  public getAllToolsSchema() {
    const schema: any = {};
    for (const [serverName, tools] of this.tools.entries()) {
      schema[serverName] = tools;
    }
    return schema;
  }
}
