# SimGemma

SimGemma is a browser-based AI agent powered by Google's Gemma 4 model, running entirely client-side with WebGPU acceleration. It provides a full-featured agent experience directly in your browser, with no server-side processing required for inference.

## Key Features

- **Local Inference**: Runs Gemma 4 E2B ONNX entirely in your browser using WebGPU and `@huggingface/transformers`.
- **Bash Shell Environment**: Includes a virtual bash shell (powered by `just-bash`) with a persistent virtual filesystem (LightningFS).
- **Git Integration**: Full git operations via `isomorphic-git`.
- **Model Context Protocol (MCP)**: Extensible tooling via MCP, allowing the agent to interact with external tools and services.
- **Web App Generation**: Capabilities to create and run web applications (HTML/Tailwind/Three.js) within the browser environment.
- **Privacy First**: All local inference happens on your machine, ensuring data privacy and offline capability.
- **API Mode**: Support for OpenAI-compatible API modes (Ollama, LM Studio, OpenRouter) for flexibility.

## Tech Stack

- **AI Model**: Gemma 4 E2B ONNX
- **Inference engine**: Hugging Face Transformers (WebGPU)
- **Shell**: just-bash
- **Filesystem**: LightningFS (IndexedDB persistence)
- **Frontend**: React 19, TypeScript, Vite
- **Terminal**: xterm.js
- **Styling**: Tailwind CSS

## Getting Started

### Prerequisites

- **Browser**: Chrome 113+ (or any browser with WebGPU support)
- **Node.js**: Recommended for local development

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/saranyadamo/gemma-agent.git
   cd gemma-agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:5173`.

## Usage

- **Local Mode**: Upon first load, the agent will download the Gemma 4 model (cached in your browser). Ensure your browser supports WebGPU.
- **API Mode**: Toggle to API mode in the settings to use an external OpenAI-compatible endpoint.
- **Terminal**: Use the interactive terminal to run bash commands, manage git repositories, or interact with MCP servers.
- **MCP**: Configure MCP servers in `/home/user/mcp.json` or use the `mcp` command.

## Project Structure

- `src/App.tsx`: Main application logic and model management.
- `src/components/Terminal.tsx`: xterm.js terminal implementation.
- `src/lib/bash/`: Core logic for the bash environment and agent tools.
- `src/lib/agent-config.ts`: Configuration and persistence logic.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
