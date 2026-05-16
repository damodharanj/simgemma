# SimGemma

## Project Overview

This is a **browser-based AI agent powered by Google's Gemma 4 model**, running entirely client-side with WebGPU acceleration. It provides:
- A bash shell environment with persistent virtual filesystem (LightningFS)
- Git operations via isomorphic-git
- MCP (Model Context Protocol) integration for extensible tooling
- Web app creation capabilities (HTML/Tailwind/Three.js)
- Support for both local inference (Gemma 4 E2B ONNX) and OpenAI-compatible API modes

SimGemma is a standalone package that leverages WebGPU to run high-performance LLMs directly in the user's browser, providing a low-latency, private, and offline-capable agent experience.

## Tech Stack

- **AI Model**: Gemma 4 E2B ONNX (onnx-community/gemma-4-E2B-it-ONNX)
- **AI Inference**: @huggingface/transformers (WebGPU, Q4F16 quantization)
- **Shell Environment**: just-bash
- **Filesystem**: LightningFS (@isomorphic-git/lightning-fs)
- **MCP**: @modelcontextprotocol/sdk
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS (via CDN for generated apps)
- **Terminal**: xterm.js
- **UI Components**: Radix UI

## Project Structure

```
simgemma/
├── src/
│   ├── main.tsx                          # Entry point, Buffer polyfill
│   ├── App.tsx                           # Main React app: model loading, chat, generation
│   ├── index.css                         # Global styles
│   ├── components/
│   │   ├── Terminal.tsx                  # xterm.js terminal emulator
│   │   ├── SettingsModal.tsx             # Config UI (local/API mode toggle)
│   │   └── ui/                          # Radix UI primitive components
│   └── lib/
│       ├── agent-config.ts                # Config management (localStorage)
│       ├── utils.ts                      # Utility functions
│       └── bash/                         # Core agent logic
│           ├── bash-system.ts             # Bash shell initialization
│           ├── agent-tools.ts             # Tool call parsing/execution
│           ├── system-prompt.ts          # Agent system prompt
│           ├── mcp-client.ts             # MCP client manager (singleton)
│           ├── mcp-command.ts            # MCP CLI command (list/add/remove)
│           ├── git-command.ts            # Git command implementation
│           ├── cat-command.ts            # File read command
│           ├── pi-command.ts             # Agent invocation command
│           ├── apps-list-command.ts      # App listing command
│           └── lightning-fs-adapter.ts   # LightningFS adapter for just-bash
├── package.json                          # Package dependencies
├── vite.config.ts                        # Vite build configuration
└── tsconfig.json                        # TypeScript config
```

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main UI, model loading (`handleLoadModel`), prompt submission, response streaming |
| `src/lib/bash/system-prompt.ts` | Defines agent behavior, tool formats, app creation rules |
| `src/lib/bash/agent-tools.ts` | Parses `<bash>` tags and `call:name{}` tool calls, executes bash/MCP tools |
| `src/lib/bash/bash-system.ts` | Initializes just-bash shell with LightningFS, executes bash commands |
| `src/lib/bash/mcp-client.ts` | Singleton MCP client manager, handles server connections/tool calls |
| `src/lib/agent-config.ts` | Loads/saves agent config (provider, model ID, API keys) to localStorage |
| `src/components/Terminal.tsx` | Interactive terminal with xterm.js, handles command input/output |

## Agent Architecture

### Initialization Flow
1. `main.tsx` polyfills `Buffer` for LightningFS/isomorphic-git
2. `App.tsx` loads config from localStorage via `agent-config.ts`
3. If local mode: Loads Gemma 4 E2B model via `@huggingface/transformers` with WebGPU/Q4F16
4. If API mode: Validates OpenAI-compatible endpoint config

### Prompt Processing Flow
1. User input (text/image) added to message history
2. System prompt + history formatted via `processor.apply_chat_template()`
3. Local mode: `model.generate()` with streaming via `TextStreamer`
4. API mode: Fetch to OpenAI-compatible `/chat/completions` endpoint
5. Response parsed for tool calls (`<bash>` tags or `call:name{}` format)
6. Tool executed (bash or MCP), result added to history, generation continues
7. Final response (no tool calls) displayed to UI

## Tool System

### Static Tools
- **bash_execute**: Execute bash commands in the just-bash shell environment

### Custom Bash Commands (via just-bash)
| Command | Purpose |
|---------|---------|
| `git` | Full git operations (clone, commit, push, etc.) via isomorphic-git |
| `cat` | Read file contents from LightningFS |
| `pi` | Invoke the agent from the terminal (delegates to `App.tsx`) |
| `mcp` | Manage MCP servers: `mcp list/add/remove/connect` |
| `apps-list` | List all apps in `/home/user/apps/` |

### MCP Tools
- Loaded from `/home/user/mcp.json` configuration
- Converted to OpenAI function format via `mcpToolToOpenAI()`
- Called via `McpClientManager.callTool()` using StreamableHTTP/SSE transport

## System Prompt

Located at `src/lib/bash/system-prompt.ts`, the system prompt defines:
- Tool call formats: `<bash>command</bash>` or `call:bash_execute{command: "..."}`
- MCP call format: `<bash>mcp-call server tool '{"arg": "value"}'</bash>`
- Bash guidelines: Heredoc handling, multi-line command rules
- App creation rules: `/home/user/apps/` directory, single `index.html` per app, Tailwind CDN, no inline styles
- 3D simulation guidelines: Use Three.js via CDN for interactive scenes

## MCP Integration

### Configuration
- Config file: `/home/user/mcp.json` (virtual filesystem path)
- Format:
  ```json
  {
    "mcpServers": {
      "server-name": { "url": "http://localhost:3001" }
    }
  }
  ```

### MCP Commands
```bash
mcp list                    # List all configured MCP servers
mcp add <name> <url>        # Add a new MCP server
mcp remove <name>           # Remove a server
mcp connect [name]          # Connect to server(s) and cache tools
```

### Client Manager
- Singleton `McpClientManager` in `src/lib/bash/mcp-client.ts`
- Automatically tries StreamableHTTP transport, falls back to SSE
- Caches connected clients and tool definitions per server

## Configuration

### Modes
1. **Local (WebGPU)**: Uses Gemma 4 E2B ONNX model, runs entirely in browser
   - Model ID: `onnx-community/gemma-4-E2B-it-ONNX`
   - Quantization: Q4F16
2. **API Mode**: Connects to OpenAI-compatible endpoints (Ollama, LM Studio, OpenRouter)
   - Configure via SettingsModal: API URL, API key, model name

### Storage
- Config stored in `localStorage` under key `agent-config`
- Virtual filesystem persisted in IndexedDB via LightningFS (indexed as `simgemma-fs`)

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server (default port 5173)
npm run build        # Production build to dist/
npm run lint         # Run ESLint checks
npm run preview      # Preview production build
```

## Environment Requirements

| Requirement | Details |
|-------------|---------|
| Browser | Chrome 113+ (WebGPU support required for local mode) |
| WebGPU | Enabled by default in Chrome 113+ |
| Network | Access to HuggingFace Hub (local mode) or OpenAI-compatible API (API mode) |
| Storage | IndexedDB support for LightningFS persistence |

## Troubleshooting

- **WebGPU not supported**: Use API mode or switch to Chrome 113+
- **Model loading fails**: Check network access to HuggingFace Hub, clear browser cache
- **MCP connection fails**: Verify server URL, check CORS settings on MCP server
- **Bash commands fail**: Ensure commands are compatible with just-bash (limited shell environment)
