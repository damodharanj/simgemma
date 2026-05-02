import { defineCommand } from 'just-bash';
import { McpClientManager } from './mcp-client';

export const mcpCommand = defineCommand('mcp', async (args, ctx) => {
  let fileContent = '{}';
  try {
    if (await ctx.fs.exists('/home/user/mcp.json')) {
      fileContent = await ctx.fs.readFile('/home/user/mcp.json', 'utf8') as string;
    } else {
      await ctx.fs.writeFile('/home/user/mcp.json', '{\n  "mcpServers": {\n  }\n}');
      fileContent = '{\n  "mcpServers": {\n  }\n}';
    }
  } catch (e) {
    // Ignore errors reading file
  }

  let config: any = { mcpServers: {} };
  try {
    config = JSON.parse(fileContent);
  } catch (e) {
    // Ignore JSON parse errors
  }
  if (!config.mcpServers) config.mcpServers = {};

  if (args.length === 0) {
    return {
      stdout: 'mcp: model context protocol utility\nUsage: mcp [list | add <name> <url> | remove <name> | connect [name]]\n',
      stderr: '',
      exitCode: 0,
    };
  }

  const subCommand = args[0];

  if (subCommand === 'list') {
    return {
      stdout: JSON.stringify(config, null, 2) + '\n',
      stderr: '',
      exitCode: 0,
    };
  }

  if (subCommand === 'add') {
    const name = args[1];
    const url = args[2];
    if (!name || !url) {
      return { stdout: '', stderr: 'Usage: mcp add <name> <url>\n', exitCode: 1 };
    }

    config.mcpServers[name] = { url };

    await ctx.fs.writeFile('/home/user/mcp.json', JSON.stringify(config, null, 2));

    return { stdout: `Added MCP server: ${name}\n`, stderr: '', exitCode: 0 };
  }

  if (subCommand === 'remove') {
    const name = args[1];
    if (!name) {
      return { stdout: '', stderr: 'Usage: mcp remove <name>\n', exitCode: 1 };
    }
    if (config.mcpServers[name]) {
      delete config.mcpServers[name];
      await ctx.fs.writeFile('/home/user/mcp.json', JSON.stringify(config, null, 2));
      return { stdout: `Removed MCP server: ${name}\n`, stderr: '', exitCode: 0 };
    }
    return { stdout: '', stderr: `Server ${name} not found\n`, exitCode: 1 };
  }

  if (subCommand === 'connect') {
    const name = args[1];
    if (!name) {
      let connectedCount = 0;
      let errors = [];
      for (const [serverName, serverCfg] of Object.entries(config.mcpServers)) {
        const cfg = serverCfg as any;
        if (cfg.url) {
          try {
            await McpClientManager.getInstance().connectServer(serverName, cfg.url);
            connectedCount++;
          } catch (e: any) {
            errors.push(`Failed to connect ${serverName}: ${e.message}`);
          }
        }
      }
      const errStr = errors.length > 0 ? `\nErrors:\n${errors.join('\n')}` : '';
      return { stdout: `Processed connection for ${connectedCount} MCP servers.\n${errStr}`, stderr: '', exitCode: errors.length > 0 ? 1 : 0 };
    }
    if (config.mcpServers[name] && config.mcpServers[name].url) {
      try {
        await McpClientManager.getInstance().connectServer(name, config.mcpServers[name].url);
        return { stdout: `Successfully connected to MCP server: ${name}\n`, stderr: '', exitCode: 0 };
      } catch (e: any) {
        return { stdout: '', stderr: `Failed to connect to ${name}: ${e.message}\n`, exitCode: 1 };
      }
    }
    return { stdout: '', stderr: `Server ${name} not found or has no URL in config\n`, exitCode: 1 };
  }

  return { stdout: '', stderr: `Unknown command: ${subCommand}\n`, exitCode: 1 };
});
