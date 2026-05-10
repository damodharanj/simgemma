import { useState, useEffect, useRef, useMemo } from 'react'
import { Send, Image as ImageIcon, Loader2, User, Bot, X, Terminal as TerminalIcon, Settings, RotateCcw, AlertCircle, Layout, Eye, FolderPlus, FolderOpen, Plus, MessageSquare, Trash2, Download, Upload } from 'lucide-react'
import { 
  AutoProcessor, 
  Gemma4ForConditionalGeneration, 
  RawImage, 
  TextStreamer,
  env 
} from '@huggingface/transformers'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Terminal } from '@/components/Terminal'
import { SettingsModal } from '@/components/SettingsModal'
import { AgentTools } from '@/lib/bash/agent-tools'
import { getSystemPrompt } from '@/lib/bash/system-prompt'
import { McpClientManager } from '@/lib/bash/mcp-client'
import { loadConfig } from '@/lib/agent-config'
import { BashSystem } from '@/lib/bash/bash-system'



// Configure transformers.js for main thread
env.allowLocalModels = true;
env.useBrowserCache = true;
env.cacheDir = 'HF_HOME';
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.proxy = false;
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | any[];
  previewUrl?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  thinking?: boolean;
}

const STATIC_TOOLS = [
  {
    type: "function",
    function: {
      name: "bash_execute",
      description: "Execute a bash command in the shell environment.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Bash command to execute" }
        },
        required: ["command"]
      }
    }
  }
];

const mcpToolToOpenAI = (serverName: string, mcpTool: any) => ({
  type: "function",
  function: {
    name: "mcp_call",
    description: `[${serverName}] ${mcpTool.description || 'MCP tool'}`,
    parameters: {
      type: "object",
      properties: {
        server: { type: "string", enum: [serverName] },
        tool: { type: "string", enum: [mcpTool.name] },
        args: { type: "string", description: "JSON string of tool arguments" }
      },
      required: ["server", "tool", "args"]
    }
  }
});

const getAllTools = () => {
  const mcpSchemas = McpClientManager.getInstance().getAllToolsSchema();
  let dynamicTools: any[] = [];
  for (const [server, tools] of Object.entries(mcpSchemas)) {
    dynamicTools.push(...(tools as any[]).map(t => mcpToolToOpenAI(server, t)));
  }
  return [...STATIC_TOOLS, ...dynamicTools];
};

interface Session {
  id: string;
  name: string;
  createdAt: string;
}

export default function App() {
  const { appName: urlAppName } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'generating' | 'error'>('idle');
  const [loadMessage, setLoadMessage] = useState(() => {
    const config = loadConfig();
    return config.provider === 'local' ? 'Initializing WebGPU...' : 'Connecting to API...';
  });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const [showTerminal, setShowTerminal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(false);
  const [htmlArtifact, setHtmlArtifact] = useState<string | null>(null);
  
  const [apps, setApps] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(urlAppName || null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [showAppSelector, setShowAppSelector] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [showCreateApp, setShowCreateApp] = useState(false);
  const [showSessionList, setShowSessionList] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const modelRef = useRef<any>(null);
  const processorRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const configRef = useRef(loadConfig());

  useEffect(() => {
    if (urlAppName !== selectedApp) {
      setSelectedApp(urlAppName || null);
    }
  }, [urlAppName]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    McpClientManager.getInstance().loadConfigAndConnect();
  }, []);

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    if (selectedApp) {
      loadSessions(selectedApp);
      loadArtifactFromFs(selectedApp);
    } else {
      setMessages([]);
      setSessions([]);
      setCurrentSession(null);
    }
  }, [selectedApp]);

  useEffect(() => {
    if (selectedApp && currentSession && messages.length > 0) {
      saveSession(selectedApp, currentSession.id, messages);
    }
  }, [messages, selectedApp, currentSession]);

  useEffect(() => {
    const handleFsChange = async () => {
      await loadApps();
      if (selectedApp) {
        await loadArtifactFromFs(selectedApp);
      }
    };
    window.addEventListener('filesystem-changed', handleFsChange);
    return () => window.removeEventListener('filesystem-changed', handleFsChange);
  }, [selectedApp]);

  useEffect(() => {
    const handleConfigChange = () => {
      configRef.current = loadConfig();
      if (configRef.current.provider === 'openai') {
        setStatus('ready');
      }
    };
    window.addEventListener('agent-config-changed', handleConfigChange);
    return () => window.removeEventListener('agent-config-changed', handleConfigChange);
  }, []);

  useEffect(() => {
    const handleAgentRequest = (e: Event) => {
      const { prompt, requestId } = (e as CustomEvent).detail;
      if (status !== 'ready') {
        window.dispatchEvent(new CustomEvent(`agent-error-${requestId}`, { detail: 'Agent not ready' }));
        return;
      }
      submitPrompt(prompt, null, requestId);
    };
    window.addEventListener('agent-request', handleAgentRequest);
    return () => window.removeEventListener('agent-request', handleAgentRequest);
  }, [status, messages]);

  const handleExportFs = async () => {
    setIsExporting(true);
    try {
      const bash = BashSystem.getInstance();
      const result = await bash.execute('fs-export');
      if (result.exitCode === 0) {
        const blob = new Blob([result.stdout], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simgemma-fs-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      console.error('Export failed:', e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFs = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsImporting(true);
      try {
        const text = await file.text();
        const bash = BashSystem.getInstance();
        const tempPath = `/tmp/import-${Date.now()}.json`;
        
        // Ensure /tmp exists
        if (!(await bash.fs.exists('/tmp'))) {
          await bash.fs.mkdir('/tmp', { recursive: true });
        }
        
        // Write the file to virtual FS
        await bash.fs.writeFile(tempPath, text);
        
        // Run fs-import on the file
        const result = await bash.execute(`fs-import ${tempPath}`);
        
        // Cleanup
        await bash.fs.rm(tempPath).catch(() => {});
        
        if (result.exitCode === 0) {
          window.dispatchEvent(new CustomEvent('filesystem-changed'));
          alert(result.stdout || 'Import completed successfully');
        } else {
          alert(`Import failed: ${result.stderr}`);
        }
      } catch (e: any) {
        console.error('Import failed:', e);
        alert(`Import failed: ${e.message}`);
      } finally {
        setIsImporting(false);
      }
    };
    input.click();
  };

  const loadApps = async () => {
    try {
      const bash = BashSystem.getInstance();
      const result = await bash.execute('ls /home/user/apps/');
      if (result.exitCode === 0 && result.stdout.trim()) {
        const appList = result.stdout.trim().split('\n').filter(Boolean);
        setApps(appList);
      } else {
        setApps([]);
      }
    } catch (e) {
      console.error('Failed to load apps:', e);
      setApps([]);
    }
  };

  const selectApp = async (appName: string) => {
    navigate(`/${appName}`);
    setSelectedApp(appName);
    setShowAppSelector(false);
    await loadArtifactFromFs(appName);
  };

  const createApp = async () => {
    if (!newAppName.trim()) return;
    
    const sanitizedName = newAppName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    try {
      const bash = BashSystem.getInstance();
      await bash.execute(`mkdir -p /home/user/apps/${sanitizedName}`);
      await bash.fs.writeFile(`/home/user/apps/${sanitizedName}/index.html`, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sanitizedName}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.0.0-alpha.2/tailwind.min.css" />
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-bold text-gray-800">${sanitizedName}</h1>
    <p class="text-gray-600 mt-2">Start building your app here</p>
  </div>
</body>
</html>`);
      
      setNewAppName('');
      setShowCreateApp(false);
      await loadApps();
      await selectApp(sanitizedName);
    } catch (e) {
      console.error('Failed to create app:', e);
    }
  };

  const deleteApp = async (appName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete app "${appName}"?`)) return;
    
    try {
      const bash = BashSystem.getInstance();
      await bash.execute(`rm -rf /home/user/apps/${appName}`);
      
      if (selectedApp === appName) {
        navigate('/');
        setSelectedApp(null);
        setHtmlArtifact(null);
      }
      
      await loadApps();
    } catch (e) {
      console.error('Failed to delete app:', e);
    }
  };

  const handleLoadModel = async () => {
    if (modelRef.current) return;
    
    const config = loadConfig();
    configRef.current = config;
    
    if (config.provider === 'openai') {
      setStatus('ready');
      setLoadMessage('Using OpenAI Compatible API');
      return;
    }
    
    setStatus('loading');
    setLoadMessage('Loading Processor...');
    
    try {
      processorRef.current = await AutoProcessor.from_pretrained(config.local.modelId);
      
      setLoadMessage('Loading Model Weights (WebGPU)...');
      modelRef.current = await (Gemma4ForConditionalGeneration as any).from_pretrained(config.local.modelId, {
        device: 'webgpu',
        dtype: 'q4f16',
      });
      
      setStatus('ready');
    } catch (error: any) {
      console.error('Initialization failed:', error);
      setStatus('error');
      setLoadMessage(`Error: ${error.message}`);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const config = loadConfig();
      if (config.provider === 'openai') {
        return;
      }
      // WebGPU mode doesn't support image input - show warning
      setMessages(prev => [...prev, {
        role: 'system',
        content: '⚠️ Warning: The WebGPU model (gemma-4-E2B-it-ONNX) does not support image input. Switch to OpenAI-compatible API mode in Settings to enable image analysis.'
      }]);
      return;
    }
  };

  const clearImage = () => setSelectedImage(null);

  const syncArtifactToSelectedApp = async (content?: string) => {
    const contentToWrite = content || htmlArtifact;
    if (!selectedApp || !contentToWrite) return;
    try {
      const bash = BashSystem.getInstance();
      await bash.fs.writeFile(`/home/user/apps/${selectedApp}/index.html`, contentToWrite);
    } catch (e) {
      console.error('Failed to sync artifact:', e);
    }
  };

  const resetChat = async () => {
    setMessages([]);
    setInput('');
    setSelectedImage(null);
  };

  const loadArtifactFromFs = async (appName?: string) => {
    try {
      const bash = BashSystem.getInstance();
      const targetApp = appName || selectedApp;
      if (!targetApp) {
        setHtmlArtifact(null);
        return;
      }
      const result = await bash.execute(`cat /home/user/apps/${targetApp}/index.html`);
      if (result.exitCode === 0 && result.stdout) {
        setHtmlArtifact(result.stdout);
      } else {
        setHtmlArtifact(null);
      }
    } catch (e) {
      console.error('Failed to load artifact:', e);
      setHtmlArtifact(null);
    }
  };

  const loadSessions = async (appName: string) => {
    try {
      const bash = BashSystem.getInstance();
      await bash.execute(`mkdir -p /home/user/apps/${appName}/sessions`);
      const result = await bash.execute(`cat /home/user/apps/${appName}/sessions/index.json`);
      if (result.exitCode === 0 && result.stdout) {
        const sessionsList = JSON.parse(result.stdout) as Session[];
        setSessions(sessionsList);
        if (sessionsList.length > 0) {
          selectSession(appName, sessionsList[0]);
        } else {
          createNewSession(appName);
        }
      } else {
        setSessions([]);
        createNewSession(appName);
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
      setSessions([]);
      createNewSession(appName);
    }
  };

  const selectSession = async (appName: string, session: Session) => {
    try {
      const bash = BashSystem.getInstance();
      const result = await bash.execute(`cat /home/user/apps/${appName}/sessions/${session.id}.json`);
      if (result.exitCode === 0 && result.stdout) {
        const msgs = JSON.parse(result.stdout) as Message[];
        setMessages(msgs);
        setCurrentSession(session);
      } else {
        setMessages([]);
        setCurrentSession(session);
      }
    } catch (e) {
      console.error('Failed to load session:', e);
      setMessages([]);
      setCurrentSession(session);
    }
  };

  const createNewSession = async (appName: string) => {
    const sessionId = `session-${Date.now()}`;
    const sessionName = `Chat ${sessions.length + 1}`;
    const newSession: Session = {
      id: sessionId,
      name: sessionName,
      createdAt: new Date().toISOString(),
    };
    
    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);
    setCurrentSession(newSession);
    setMessages([]);

    try {
      const bash = BashSystem.getInstance();
      await bash.fs.writeFile(`/home/user/apps/${appName}/sessions/index.json`, JSON.stringify(updatedSessions));
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  };

  const deleteSession = async (appName: string, sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === sessionId);
    if (!session || !confirm(`Delete "${session.name}"?`)) return;

    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(updatedSessions);

    try {
      const bash = BashSystem.getInstance();
      await bash.execute(`rm -f /home/user/apps/${appName}/sessions/${sessionId}.json`);
      await bash.fs.writeFile(`/home/user/apps/${appName}/sessions/index.json`, JSON.stringify(updatedSessions));

      if (currentSession?.id === sessionId) {
        if (updatedSessions.length > 0) {
          selectSession(appName, updatedSessions[0]);
        } else {
          createNewSession(appName);
        }
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  const saveSession = async (appName: string, sessionId: string, msgs: Message[]) => {
    try {
      const bash = BashSystem.getInstance();
      await bash.fs.writeFile(`/home/user/apps/${appName}/sessions/${sessionId}.json`, JSON.stringify(msgs));
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedImage) return;
    
    const config = loadConfig();
    if (selectedImage && config.provider === 'openai') {
      setMessages(prev => [...prev, {
        role: 'system',
        content: '⚠️ Image input is not supported when using OpenAI Compatible API. Please switch to Local (WebGPU) mode or use text-only queries.'
      }]);
      return;
    }
    
    submitPrompt(input, selectedImage);
  };

  const submitPromptApi = async (textInput: string, imageInput: string | null, requestId?: string) => {
    const config = configRef.current;

    const userMsg: Message = {
      role: 'user',
      content: textInput,
      previewUrl: imageInput || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSelectedImage(null);
    setStatus('generating');

    // Add thinking message
    setMessages(prev => [...prev, { role: 'assistant', content: '', thinking: true }]);

    try {
      const allTools = getAllTools();

    // Build full message history for API (excluding thinking messages)
      const allMessages = [...messages, userMsg];
      const apiMessages = allMessages.filter(m => !(m.role === 'assistant' && m.thinking));

      const history = [
        { role: 'system', content: getSystemPrompt(selectedApp) },
        ...apiMessages
      ];

      const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.openai.apiKey ? { 'Authorization': `Bearer ${config.openai.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: config.openai.modelId,
          messages: history.map((m: any) => {
            const msg: any = {
              role: m.role,
              content: typeof m.content === 'string' ? m.content : m.content
            };
            if (m.tool_calls) msg.tool_calls = m.tool_calls;
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
            return msg;
          }),
          tools: allTools,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices?.[0]?.message;

      if (assistantMessage?.tool_calls) {
        const toolCall = assistantMessage.tool_calls[0];
        const toolCallId = toolCall.id || crypto.randomUUID();

        // Update thinking message with tool calls
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: assistantMessage.content || '',
              tool_calls: assistantMessage.tool_calls,
              thinking: false
            };
          }
          return updated;
        });

        if (requestId) {
          window.dispatchEvent(new CustomEvent('terminal-write', { detail: `\r\n\x1b[1;33mExecuting: ${toolCall.function.name}...\x1b[0m\r\n` }));
        }

        let result: any;
        const args = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === 'bash_execute') {
          result = await AgentTools.executeBash(args.command);
          window.dispatchEvent(new CustomEvent('filesystem-changed'));
        } else if (toolCall.function.name === 'mcp_call') {
          result = await McpClientManager.getInstance().callTool(args.server, args.tool, JSON.parse(args.args));
        }

        const resultPayload = JSON.stringify(result);
        setMessages(prev => [...prev, { role: 'tool', tool_call_id: toolCallId, content: resultPayload }]);

        if (requestId) {
          window.dispatchEvent(new CustomEvent('terminal-write', { detail: `\x1b[1;32mTool Finished\x1b[0m\r\n` }));
        }

        // Filter out thinking messages for API call
        const apiMessages = messages.filter(m => !(m.role === 'assistant' && m.thinking));
        setTimeout(() => continueGeneratingApi([
          ...apiMessages, userMsg,
          { role: 'assistant', content: assistantMessage.content || '', tool_calls: assistantMessage.tool_calls },
          { role: 'tool', tool_call_id: toolCallId, content: resultPayload }
        ], requestId), 500);
      } else {
        const assistantResponse = assistantMessage?.content || '';
        
        // Update thinking message with response
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: assistantResponse,
              thinking: false
            };
          }
          return updated;
        });

        const htmlArtifactContent = AgentTools.parseHtmlArtifact(assistantResponse);
        if (htmlArtifactContent) {
          setHtmlArtifact(htmlArtifactContent);
          await syncArtifactToSelectedApp(htmlArtifactContent);
        } else if (selectedApp) {
          // If no artifact in response but we have an app selected, reload from filesystem
          await loadArtifactFromFs(selectedApp);
        }
        setStatus('ready');
        if (requestId) {
          window.dispatchEvent(new CustomEvent(`agent-done-${requestId}`));
        }
      }
    } catch (error: any) {
      console.error('API generation failed:', error);
      setStatus('error');
      setLoadMessage(`Error: ${error.message}`);
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`agent-error-${requestId}`, { detail: error.message }));
      }
    }
  };

  const continueGeneratingApi = async (extendedHistory: Message[], requestId?: string) => {
    const config = configRef.current;
    setStatus('generating');

    // Add thinking message
    const thinkingMsg: Message = { role: 'assistant', content: '', thinking: true };
    const updatedHistory = [...extendedHistory, thinkingMsg];
    setMessages(updatedHistory);

    try {
      const allTools = getAllTools();

      // Filter out thinking messages (empty assistant messages) from API history
      const filteredHistory = extendedHistory.filter(m => !(m.role === 'assistant' && m.thinking));

      const history = [
        { role: 'system', content: getSystemPrompt(selectedApp) },
        ...filteredHistory
      ];

      const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.openai.apiKey ? { 'Authorization': `Bearer ${config.openai.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: config.openai.modelId,
          messages: history.map((m: any) => {
            const base: any = {
              role: m.role,
              content: typeof m.content === 'string' ? m.content : m.content
            };
            if (m.tool_calls) base.tool_calls = m.tool_calls;
            if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
            return base;
          }),
          tools: allTools,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices?.[0]?.message;

      if (assistantMessage?.tool_calls) {
        const toolCall = assistantMessage.tool_calls[0];
        const toolCallId = toolCall.id || crypto.randomUUID();

        const assistantMsg: Message = {
          role: 'assistant',
          content: assistantMessage.content || '',
          tool_calls: assistantMessage.tool_calls,
          thinking: false
        };
        const toolMsg: Message = { role: 'tool', tool_call_id: toolCallId, content: '' };

        // Update thinking message with tool_calls
        const newHistory = [...extendedHistory, assistantMsg, toolMsg];
        setMessages(newHistory);

        if (requestId) {
          window.dispatchEvent(new CustomEvent('terminal-write', { detail: `\r\n\x1b[1;33mExecuting: ${toolCall.function.name}...\x1b[0m\r\n` }));
        }

        let result: any;
        const args = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === 'bash_execute') {
          result = await AgentTools.executeBash(args.command);
          window.dispatchEvent(new CustomEvent('filesystem-changed'));
        } else if (toolCall.function.name === 'mcp_call') {
          result = await McpClientManager.getInstance().callTool(args.server, args.tool, JSON.parse(args.args));
        }

        const resultPayload = JSON.stringify(result);
        toolMsg.content = resultPayload;

        if (requestId) {
          window.dispatchEvent(new CustomEvent('terminal-write', { detail: `\x1b[1;32mTool Finished\x1b[0m\r\n` }));
        }

        setTimeout(() => continueGeneratingApi([
          ...extendedHistory,
          assistantMsg,
          { role: 'tool', tool_call_id: toolCallId, content: resultPayload }
        ], requestId), 500);
      } else {
        const assistantResponse = assistantMessage?.content || '';

        const assistantMsg: Message = {
          role: 'assistant',
          content: assistantResponse,
          thinking: false
        };
        const newHistory = [...extendedHistory, assistantMsg];
        setMessages(newHistory);

        const htmlArtifactContent = AgentTools.parseHtmlArtifact(assistantResponse);
        if (htmlArtifactContent) {
          setHtmlArtifact(htmlArtifactContent);
          await syncArtifactToSelectedApp(htmlArtifactContent);
        } else if (selectedApp) {
          // If no artifact in response but we have an app selected, reload from filesystem
          await loadArtifactFromFs(selectedApp);
        }
        setStatus('ready');
        if (requestId) {
          window.dispatchEvent(new CustomEvent(`agent-done-${requestId}`));
        }
      }
    } catch (error: any) {
      console.error('API follow-up generation failed:', error);
      setStatus('error');
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`agent-error-${requestId}`, { detail: error.message }));
      }
    }
  };

  const submitPrompt = async (textInput: string, imageInput: string | null = null, requestId?: string) => {
    const config = configRef.current;
    
    if (config.provider === 'openai') {
      await submitPromptApi(textInput, imageInput, requestId);
      return;
    }
    
    if (!modelRef.current || !processorRef.current) return;

    const userContent = imageInput 
      ? [
          { type: 'image' },
          { type: 'text', text: textInput }
        ]
      : textInput;

    const userMsg: Message = {
      role: 'user',
      content: userContent,
      previewUrl: imageInput || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    if (!requestId) {
      setInput('');
      setSelectedImage(null);
    }
    setStatus('generating');

    try {
      // Prepare Chat Template with native tool calling
      const allTools = getAllTools();

      const history: any[] = [
        { role: 'system', content: getSystemPrompt(selectedApp) },
        ...messages,
        userMsg
      ].map((m: any) => ({
        role: m.role,
        content: m.content,
        ...(m.previewUrl ? { images: [m.previewUrl] } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {})
      }));

      const promptString = await processorRef.current.apply_chat_template(history, {
        add_generation_prompt: true,
        tokenize: false,
        enable_thinking: false,
        tools: allTools,
      });

      // Collect all images from history for context
      const imageUrls = [...messages, userMsg]
        .filter(m => m.previewUrl)
        .map(m => m.previewUrl as string);

      let images: any[] = [];
      if (imageUrls.length > 0) {
        images = await Promise.all(imageUrls.map(url => RawImage.fromURL(url)));
      }

      // Process Text and Images together
      // Signature for Gemma 4 E2B is (text, images, audios, options)
      const inputs = await processorRef.current(
        promptString, 
        images.length > 0 ? images : null, 
        null, // Audio placeholder
        {
          add_special_tokens: false,
          return_dict: true,
        }
      );

      // 1. Add an empty assistant message to be filled by the streamer
      setMessages(prev => [...prev, { role: 'assistant', content: '', thinking: true }]);

      // 2. Setup streamer
      let generatedText = '';
      const streamer = new TextStreamer(processorRef.current.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => {
          generatedText += text;
          if (requestId) {
            window.dispatchEvent(new CustomEvent('terminal-write', { detail: text }));
          }
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              const updated = [...prev];
              updated[updated.length - 1] = { 
                ...last, 
                content: last.content + text,
                thinking: false
              };
              return updated;
            }
            return prev;
          });
        }
      });

      // 3. Generate with streamer
      const terminators = modelRef.current.generation_config?.eos_token_id || [1, 106, 50];
      await modelRef.current.generate({
        ...inputs,
        max_new_tokens: 1024,
        do_sample: false,
        streamer,
        eos_token_id: terminators,
        return_dict_in_generate: true,
      });

      // Get the newly generated text directly from the streamer accumulation
      const assistantResponse = generatedText.trim();

      const toolCall = AgentTools.parseGemmaToolCall(assistantResponse);

      if (toolCall) {
        const toolCallId = crypto.randomUUID();
        setStatus('generating'); // Keep generating status

        // Add assistant message with tool_calls
        const assistantMsg: Message = {
          role: 'assistant',
          content: assistantResponse,
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) }
          }]
        };
        setMessages(prev => [...prev, assistantMsg]);

        if (requestId) {
          window.dispatchEvent(new CustomEvent('terminal-write', { detail: `\r\n\x1b[1;33mExecuting: ${toolCall.name}...\x1b[0m\r\n` }));
        }

        // Execute the tool
        let result: any;
        if (toolCall.name === 'bash_execute') {
          result = await AgentTools.executeBash(toolCall.arguments.command);
          window.dispatchEvent(new CustomEvent('filesystem-changed'));
        } else if (toolCall.name === 'mcp_call') {
          // Handle args being either a string or already-parsed object
          let toolArgs = toolCall.arguments.args;
          if (typeof toolArgs === 'string') {
            try { toolArgs = JSON.parse(toolArgs); } catch {}
          }
          result = await McpClientManager.getInstance().callTool(
            toolCall.arguments.server,
            toolCall.arguments.tool,
            toolArgs
          );
        }

        const resultPayload = JSON.stringify(result);
        if (requestId) {
          window.dispatchEvent(new CustomEvent('terminal-write', { detail: `\x1b[1;32mTool Finished\x1b[0m\r\n` }));
        }

        // Add tool result message
        setMessages(prev => [...prev, { role: 'tool', tool_call_id: toolCallId, content: resultPayload }]);

        // Trigger follow-up generation
        setTimeout(() => continueGenerating([
          ...messages, userMsg,
          assistantMsg,
          { role: 'tool', tool_call_id: toolCallId, content: resultPayload }
        ], requestId), 500);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: assistantResponse }]);

        const htmlArtifactContent = AgentTools.parseHtmlArtifact(assistantResponse);
        if (htmlArtifactContent) {
          setHtmlArtifact(htmlArtifactContent);
        }
        await syncArtifactToSelectedApp(htmlArtifactContent);
        setStatus('ready');
        if (requestId) {
          window.dispatchEvent(new CustomEvent(`agent-done-${requestId}`));
        }
      }
    } catch (error: any) {
      console.error('Generation failed:', error);
      setStatus('error');
      setLoadMessage(`Generation Error: ${error.message}`);
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`agent-error-${requestId}`, { detail: error.message }));
      }
    }
  };

  const continueGenerating = async (extendedHistory: Message[], requestId?: string) => {
    if (!modelRef.current || !processorRef.current) return;
    setStatus('generating');

    try {
      const allTools = getAllTools();

      const history = [
        { role: 'system', content: getSystemPrompt(selectedApp) },
        ...extendedHistory
      ].map((m: any) => {
        const base: any = {
          role: m.role,
          content: m.content
        };
        if (m.tool_calls) base.tool_calls = m.tool_calls;
        if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
        return base;
      });

      const promptString = await processorRef.current.apply_chat_template(history, {
        add_generation_prompt: true,
        tokenize: false,
        enable_thinking: false,
        tools: allTools,
      });

      const inputs = await processorRef.current(promptString, null, null, {
        add_special_tokens: false,
        return_dict: true,
      });

      // Add thinking message to history
      const thinkingMsg: Message = { role: 'assistant', content: '', thinking: true };
      const historyWithThinking = [...extendedHistory, thinkingMsg];
      setMessages(historyWithThinking);

      let generatedText = '';
      const streamer = new TextStreamer(processorRef.current.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => {
          generatedText += text;
          if (requestId) {
            window.dispatchEvent(new CustomEvent('terminal-write', { detail: text }));
          }
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, content: last.content + text, thinking: false };
              return updated;
            }
            return prev;
          });
        }
      });

      const terminators = modelRef.current.generation_config?.eos_token_id || [1, 106, 50];
      await modelRef.current.generate({
        ...inputs,
        max_new_tokens: 1024,
        do_sample: false,
        streamer,
        eos_token_id: terminators,
        return_dict_in_generate: true,
      });

      const assistantResponse = generatedText.trim();

      const toolCall = AgentTools.parseGemmaToolCall(assistantResponse);

      if (toolCall) {
        const toolCallId = crypto.randomUUID();
        setStatus('generating');

        const assistantMsg: Message = {
          role: 'assistant',
          content: assistantResponse,
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) }
          }]
        };

        // Add assistant message with tool_calls to history
        const historyWithAssistant = [...extendedHistory, assistantMsg];
        setMessages(historyWithAssistant);

        if (requestId) {
          window.dispatchEvent(new CustomEvent('terminal-write', { detail: `\r\n\x1b[1;33mExecuting: ${toolCall.name}...\x1b[0m\r\n` }));
        }

        let result: any;
        if (toolCall.name === 'bash_execute') {
          result = await AgentTools.executeBash(toolCall.arguments.command);
          window.dispatchEvent(new CustomEvent('filesystem-changed'));
        } else if (toolCall.name === 'mcp_call') {
          // Handle args being either a string or already-parsed object
          let toolArgs = toolCall.arguments.args;
          if (typeof toolArgs === 'string') {
            try { toolArgs = JSON.parse(toolArgs); } catch {}
          }
          result = await McpClientManager.getInstance().callTool(
            toolCall.arguments.server,
            toolCall.arguments.tool,
            toolArgs
          );
        }

        const resultPayload = JSON.stringify(result);
        if (requestId) {
          window.dispatchEvent(new CustomEvent('terminal-write', { detail: `\x1b[1;32mTool Finished\x1b[0m\r\n` }));
        }

        // Add tool result to history
        const toolMsg: Message = { role: 'tool', tool_call_id: toolCallId, content: resultPayload };
        const finalHistory = [...historyWithAssistant, toolMsg];
        setMessages(finalHistory);

        setTimeout(() => continueGenerating([
          ...extendedHistory,
          assistantMsg,
          toolMsg
        ], requestId), 500);
      } else {
        // No tool call - final response
        const assistantMsg: Message = {
          role: 'assistant',
          content: assistantResponse
        };
        const finalHistory = [...extendedHistory, assistantMsg];
        setMessages(finalHistory);

        const htmlArtifactContent = AgentTools.parseHtmlArtifact(assistantResponse);
        if (htmlArtifactContent) {
          setHtmlArtifact(htmlArtifactContent);
          await syncArtifactToSelectedApp(htmlArtifactContent);
        } else if (selectedApp) {
          // If no artifact in response but we have an app selected, reload from filesystem
          // (changes might have been made via bash commands)
          await loadArtifactFromFs(selectedApp);
        }
        setStatus('ready');
        if (requestId) {
          window.dispatchEvent(new CustomEvent(`agent-done-${requestId}`));
        }
      }
    } catch (error: any) {

      console.error('Follow-up generation failed:', error);
      setStatus('error');
      if (requestId) {
        window.dispatchEvent(new CustomEvent(`agent-error-${requestId}`, { detail: error.message }));
      }
    }
  };


  const htmlArtifactUrl = useMemo(() => {
    if (!htmlArtifact) return null;
    const blob = new Blob([htmlArtifact], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [htmlArtifact]);

  const renderMessageContent = (content: string) => {
    if (!content) return null;
    
    const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);
    
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
        return (
          <pre key={i} className="my-2 rounded-lg bg-black/30 p-3 overflow-x-auto text-sm font-mono">
            <code>{code}</code>
          </pre>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="bg-muted/50 rounded px-1.5 py-0.5 text-sm font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part.split('\n').map((line, j) => (
        <span key={`${i}-${j}`}>
          {j > 0 && <br />}
          {line}
        </span>
      ));
    });
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'idle': return 'Not initialized';
      case 'loading': return 'Loading model...';
      case 'ready': return 'Ready';
      case 'generating': return 'Generating...';
      case 'error': return 'Error';
      default: return status;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'ready': return 'bg-emerald-500';
      case 'generating': return 'bg-blue-500 animate-pulse';
      case 'loading': return 'bg-amber-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-muted-foreground';
    }
  };

  return (
    <div className="dark flex h-screen bg-background text-foreground font-sans">
      {/* Chat Panel */}
      <div className="flex w-full flex-col border-r border-border bg-card md:w-96">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">SimGemma</h1>
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {getStatusLabel()}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground md:hidden"
              onClick={() => setShowPreview(true)}
              title="Show Preview"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={resetChat}
              title="Reset Chat"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-lg ${showToolCalls ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setShowToolCalls(!showToolCalls)}
              title="Toggle Tool Calls"
            >
              <TerminalIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-lg ${showTerminal ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setShowTerminal(!showTerminal)}
              title="Toggle Terminal"
            >
              <TerminalIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-lg ${showSettings ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={handleExportFs}
              disabled={isExporting}
              title="Export Filesystem"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={handleImportFs}
              disabled={isImporting}
              title="Import Filesystem"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* App Selector */}
        <div className="border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowAppSelector(!showAppSelector); setShowCreateApp(false); setShowSessionList(false); }}
              className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
            >
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">
                {selectedApp ? selectedApp : 'Select an app...'}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg shrink-0"
              onClick={() => { setShowCreateApp(true); setShowAppSelector(true); setShowSessionList(false); }}
              title="Create new app"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>
          
          {showAppSelector && !showSessionList && (
            <div className="relative z-20 mt-2 rounded-lg border border-border bg-card shadow-lg">
              <div className="p-2">
                {showCreateApp ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Create new app</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="app-name"
                        className="h-8 text-sm"
                        value={newAppName}
                        onChange={(e) => setNewAppName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && createApp()}
                      />
                      <Button size="sm" className="h-8" onClick={createApp}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowCreateApp(false)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {apps.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">No apps yet. Create one!</p>
                    ) : (
                      apps.map((app) => (
                        <div
                          key={app}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                            selectedApp === app ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                          }`}
                          onClick={() => selectApp(app)}
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">{app}</span>
                          <button
                            onClick={(e) => deleteApp(app, e)}
                            className="h-5 w-5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
                            title="Delete app"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                    <button
                      onClick={() => setShowCreateApp(true)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create new app
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Session List */}
          {selectedApp && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSessionList(!showSessionList)}
                  className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {currentSession ? currentSession.name : 'Select a chat...'}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg shrink-0"
                  onClick={() => createNewSession(selectedApp)}
                  title="New chat"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {showSessionList && (
                <div className="relative z-20 mt-2 rounded-lg border border-border bg-card shadow-lg">
                  <div className="p-2">
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {sessions.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">No chats yet</p>
                      ) : (
                        sessions.map((session) => (
                          <div
                            key={session.id}
                            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                              currentSession?.id === session.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                            }`}
                            onClick={() => { selectSession(selectedApp, session); setShowSessionList(false); }}
                          >
                            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1 truncate">{session.name}</span>
                            <button
                              onClick={(e) => deleteSession(selectedApp, session.id, e)}
                              className="h-5 w-5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
                              title="Delete chat"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative flex-1 overflow-hidden">
          <ScrollArea className="h-full px-4 py-4 scrollbar-thin">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
                <div className="relative">
                  <div className="absolute inset-0 blur-3xl animate-pulse-slow bg-primary/20 rounded-full -inset-4" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-white/10">
                    <Bot className="h-10 w-10 text-primary" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    Gemma 4
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Multimodal AI running locally in your browser
                  </p>
                </div>

                {status === 'idle' && (
                  <Button 
                    onClick={handleLoadModel} 
                    size="lg" 
                    className="gap-2 px-6 h-11 rounded-xl font-medium shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
                  >
                    <Bot className="h-4 w-4" />
                    {loadConfig().provider === 'local' ? 'Initialize WebGPU' : 'Connect to API'}
                  </Button>
                )}
                
                {status === 'ready' && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Ready for input
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {messages.map((msg, i) => {
                  const isUser = msg.role === 'user';
                  const isSystem = msg.role === 'system';
                  const isTool = msg.role === 'tool';
                  
                  if (isTool && !showToolCalls) return null;
                  
                  return (
                    <div 
                      key={i} 
                      className={`flex gap-3 animate-slide-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isUser 
                          ? 'bg-primary/10 text-primary' 
                          : isSystem 
                            ? 'bg-amber-500/10 text-amber-400'
                            : isTool
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-muted text-muted-foreground'
                      }`}>
                        {isUser ? <User className="h-4 w-4" /> : 
                         isSystem ? <AlertCircle className="h-4 w-4" /> :
                         isTool ? <TerminalIcon className="h-4 w-4" /> :
                         <Bot className="h-4 w-4" />}
                      </div>
                      
                      <div className={`flex max-w-[80%] flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
                        {msg.previewUrl && (
                          <div className="overflow-hidden rounded-xl border border-border">
                            <img src={msg.previewUrl} alt="Uploaded" className="max-h-48 w-auto object-cover" />
                          </div>
                        )}
                        
                        <div className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                          isUser
                            ? 'bg-primary text-primary-foreground'
                            : isSystem
                              ? 'bg-amber-500/10 text-amber-400 font-mono text-xs border border-amber-500/20'
                              : isTool
                                ? 'bg-blue-500/10 text-blue-400 font-mono text-xs border border-blue-500/20'
                                : 'bg-muted text-foreground'
                        }`}>
                          <div className="message-content whitespace-pre-wrap break-words">
                            {msg.thinking ? (
                              <div className="flex items-center gap-1.5 py-1">
                                <span className="text-muted-foreground text-xs">Thinking</span>
                                <span className="inline-flex gap-1">
                                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </span>
                              </div>
                            ) : typeof msg.content === 'string' ? (
                              renderMessageContent(msg.content)
                            ) : (
                              msg.content.find((c: any) => c.type === 'text')?.text || ''
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={scrollRef} />
              </div>
            )}
            
            {status === 'loading' && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-6 px-8 text-center">
                  <div className="relative">
                    <div className="absolute inset-0 blur-2xl bg-primary/20 rounded-full animate-pulse" />
                    <div className="relative flex h-20 w-20 items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                      <Bot className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">Loading Model</p>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{loadMessage}</p>
                  </div>
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-full animate-shimmer bg-gradient-to-r from-primary/50 via-primary to-primary/50 bg-[length:200%_100%]" />
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground/60">
                    ~1.4GB 4-bit quantized model
                  </p>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="border-t border-border p-3">
          {selectedImage && (
            <div className="relative mb-3 inline-block">
              <div className="overflow-hidden rounded-lg border border-border">
                <img src={selectedImage} alt="Selected" className="h-16 w-16 object-cover" />
              </div>
              <button
                onClick={clearImage}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <ImageIcon className="h-5 w-5" />
              <input 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={handleImageUpload} 
                disabled={status !== 'ready'} 
              />
            </label>
            <Input
              placeholder={status === 'generating' ? "Generating..." : status === 'idle' ? "Initialize to chat..." : "Type a message..."}
              className="flex-1 h-10 rounded-lg text-sm"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={status !== 'ready'}
            />
            <Button 
              size="icon" 
              className="h-10 w-10 rounded-lg shrink-0 transition-all disabled:opacity-50" 
              onClick={handleSend}
              disabled={status !== 'ready' || (!input.trim() && !selectedImage)}
            >
              {status === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Preview Panel - Desktop */}
      <div className="hidden md:flex md:flex-1 md:flex-col md:bg-background">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Preview</h2>
            {selectedApp && (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {selectedApp}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => loadArtifactFromFs()}
            title="Refresh Preview"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-hidden">
          {htmlArtifact ? (
            <iframe
              src={htmlArtifactUrl ?? undefined}
              className="h-full w-full border-0 bg-white"
              title="Artifact Preview"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                <Bot className="h-8 w-8 opacity-50" />
              </div>
              {!selectedApp ? (
                <div className="text-center">
                  <p className="text-sm">Select or create an app to get started</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Use the app selector above</p>
                </div>
              ) : (
                <p className="text-sm">HTML artifacts will appear here</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview Panel - Mobile Overlay */}
      {showPreview && (
        <div className="fixed inset-0 z-40 flex flex-col bg-card md:hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setShowPreview(false)}
              >
                <Layout className="h-4 w-4" />
              </Button>
              <h2 className="text-sm font-medium">Preview</h2>
              {selectedApp && (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {selectedApp}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => loadArtifactFromFs()}
              title="Refresh Preview"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex-1 overflow-hidden">
            {htmlArtifact ? (
              <iframe
                src={htmlArtifactUrl ?? undefined}
                className="h-full w-full border-0 bg-white"
                title="Artifact Preview"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                  <Bot className="h-7 w-7 opacity-50" />
                </div>
                {!selectedApp ? (
                  <div className="text-center">
                    <p className="text-sm">Select or create an app</p>
                  </div>
                ) : (
                  <p className="text-sm">HTML artifacts will appear here</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showTerminal && <Terminal onClose={() => setShowTerminal(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
