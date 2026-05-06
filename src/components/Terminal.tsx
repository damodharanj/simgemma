import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { BashSystem } from '@/lib/bash/bash-system';
import { X, Maximize2, Minimize2, Search } from 'lucide-react';

interface TerminalProps {
  onClose: () => void;
}

const HISTORY_KEY = 'simgemma-terminal-history';
const MAX_HISTORY = 1000;

const loadHistory = (): string[] => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveHistory = (history: string[]) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch (e) {
    console.error('Failed to save history', e);
  }
};

const COMPLETIONS = [
  'clear', 'cls', 'help', 'history', 'exit', 'pwd', 'ls', 'cd', 'mkdir', 'rmdir',
  'rm', 'cp', 'mv', 'cat', 'echo', 'touch', 'grep', 'find', 'chmod', 'chown',
  'git', 'git status', 'git add', 'git commit', 'git push', 'git pull', 'git clone',
  'git checkout', 'git branch', 'git diff', 'git log', 'npm', 'npm install',
  'npm run', 'npm start', 'npm build', 'npm test', 'npm run dev', 'npm run lint',
  'npx', 'node', 'yarn', 'pnpm', 'cargo', 'rustc', 'pip', 'python', 'python3',
  'mcp', 'mcp add', 'mcp list', 'mcp remove', 'mcp start', 'mcp-call',
  'pi', 'cat'
];

const baseCompletions = (input: string): string[] => {
  const lower = input.toLowerCase().trim();
  if (!lower) return [];
  return COMPLETIONS.filter(c => c.toLowerCase().startsWith(lower)).sort();
};

const getFileCompletions = async (input: string, cwd: string): Promise<string[]> => {
  if (!input) return [];
  const bashSystem = BashSystem.getInstance();
  try {
    const dir = input.includes('/') ? input.slice(0, input.lastIndexOf('/')) : '.';
    const prefix = input.includes('/') ? input.slice(input.lastIndexOf('/') + 1) : input;
    const path = dir === '.' ? cwd : dir;
    const entries = await bashSystem.fs.readdir(path);
    const matches = entries.filter(e => e.toLowerCase().startsWith(prefix.toLowerCase()));
    return matches.map(e => {
      if (dir === '.' || dir === '') return e;
      return `${dir}/${e}`.replace(/^\.\//, '');
    });
  } catch {
    return [];
  }
};

export const Terminal: React.FC<TerminalProps> = ({ onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [cwd, setCwd] = useState('/home/user');
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 936, y: window.innerHeight - 536 });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const bashSystem = BashSystem.getInstance();

  const currentInput = useRef('');
  const history = useRef<string[]>(loadHistory());
  const historyIndex = useRef(-1);
  const searchQuery = useRef('');
  const searchResults = useRef<number[]>([]);
  const searchResultIndex = useRef(-1);
  const savedInput = useRef('');

  const getPrompt = useCallback(() => `\x1b[1;34m${cwd}\x1b[0m $ `, [cwd]);

  const writePrompt = useCallback(() => {
    xtermRef.current?.write(isSearchMode ? `\x1b[1;33m(reverse-i-search)\`${getPrompt()}` : getPrompt());
  }, [getPrompt, isSearchMode]);

  const clearLine = useCallback(() => {
    const term = xtermRef.current;
    if (!term) return;
    term.write('\r\x1b[K');
  }, []);

  const redrawInput = useCallback(() => {
    const term = xtermRef.current;
    if (!term) return;
    if (isSearchMode) {
      term.write(`\r\x1b[1;33m(reverse-i-search)\`${searchQuery.current}: `);
      if (searchResults.current.length > 0) {
        const idx = searchResults.current[searchResultIndex.current];
        const cmd = history.current[idx];
        term.write(`\x1b[7m${cmd}\x1b[0m`.replace(/\n/g, '\r\n'));
      }
    } else {
      term.write('\r' + getPrompt() + currentInput.current.replace(/\n/g, '\r\n'));
    }
  }, [getPrompt, isSearchMode]);

  const searchHistory = useCallback((query: string) => {
    if (!query) {
      searchResults.current = [];
      searchResultIndex.current = -1;
      return;
    }
    const results: number[] = [];
    for (let i = history.current.length - 1; i >= 0; i--) {
      if (history.current[i].toLowerCase().includes(query.toLowerCase())) {
        results.push(i);
      }
    }
    searchResults.current = results;
    searchResultIndex.current = results.length > 0 ? 0 : -1;
  }, []);

  const addToHistory = useCallback((cmd: string) => {
    if (cmd.trim() && history.current[history.current.length - 1] !== cmd) {
      history.current.push(cmd);
      saveHistory(history.current);
    }
    historyIndex.current = history.current.length;
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background: '#020617',
        foreground: '#f1f5f9',
        cursor: '#3b82f6',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f8fafc',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      allowTransparency: false,
      macOptionIsMeta: true,
      scrollback: 10000,
      disableStdin: false,
      altClickMovesCursor: true,
      rightClickSelectsWord: true,
      screenReaderMode: true,
    });
    
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();
    
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[1;36m╔════════════════════════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[1;36m║\x1b[0m     \x1b[1;32mSimGemma Browser Terminal v1.0\x1b[0m                       \x1b[1;36m║\x1b[0m');
    term.writeln('\x1b[1;36m║\x1b[0m     Type \x1b[1;33mhelp\x1b[0m for available commands                     \x1b[1;36m║\x1b[0m');
    term.writeln('\x1b[1;36m║\x1b[0m     \x1b[1;35mCtrl+R\x1b[0m: reverse-search  \x1b[1;35mUp/Down\x1b[0m: history        \x1b[1;36m║\x1b[0m');
    term.writeln('\x1b[1;36m║\x1b[0m     \x1b[1;35mCtrl+L\x1b[0m: clear      \x1b[1;35mCtrl+D\x1b[0m: exit           \x1b[1;36m║\x1b[0m');
    term.writeln('\x1b[1;36m║\x1b[0m     \x1b[1;35mCtrl+C\x1b[0m: interrupt  \x1b[1;35mTab\x1b[0m: complete       \x1b[1;36m║\x1b[0m');
    term.writeln('\x1b[1;36m╚════════════════════════════════════════════════════════╝\x1b[0m');
    term.write('\r\n');
    writePrompt();

    const handleInput = async (data: string) => {
      const code = data.charCodeAt(0);

      if (data === '\x1b[A') { // Arrow Up
        if (isSearchMode) {
          if (searchResultIndex.current < searchResults.current.length - 1) {
            searchResultIndex.current++;
            redrawInput();
          }
        } else if (history.current.length > 0 && historyIndex.current > 0) {
          historyIndex.current--;
          currentInput.current = history.current[historyIndex.current];
          clearLine();
          xtermRef.current?.write(getPrompt() + currentInput.current.replace(/\n/g, '\r\n'));
        }
        return;
      }

      if (data === '\x1b[B') { // Arrow Down
        if (isSearchMode) {
          if (searchResultIndex.current > 0) {
            searchResultIndex.current--;
            redrawInput();
          } else if (searchResultIndex.current === 0) {
            searchResultIndex.current = -1;
            clearLine();
            term.write('\r' + getPrompt() + searchQuery.current.replace(/\n/g, '\r\n'));
          }
        } else if (historyIndex.current < history.current.length) {
          historyIndex.current++;
          currentInput.current = historyIndex.current === history.current.length 
            ? '' 
            : history.current[historyIndex.current];
          clearLine();
          xtermRef.current?.write(getPrompt() + currentInput.current.replace(/\n/g, '\r\n'));
        }
        return;
      }

      if (data === '\x1b[C') { // Arrow Right
        return;
      }

      if (data === '\x1b[D') { // Arrow Left
        return;
      }

      if (data === '\x1b[H' || data === '\x1b[1~') { // Home
        clearLine();
        term.write(getPrompt());
        return;
      }

      if (data === '\x1b[F' || data === '\x1b[4~') { // End
        return;
      }

      if (data === '\x08' || data === '\x7f') { // Backspace (BS) or Delete (DEL)
        if (currentInput.current.length > 0) {
          currentInput.current = currentInput.current.slice(0, -1);
          term.write('\b \b');
        }
        return;
      }

      if (data === '\x12') { // Ctrl+R
        if (isSearchMode) {
          setIsSearchMode(false);
          searchQuery.current = '';
          searchResults.current = [];
          term.write('\r\n');
          writePrompt();
          term.write(currentInput.current.replace(/\n/g, '\r\n'));
        } else {
          savedInput.current = currentInput.current;
          searchQuery.current = '';
          setIsSearchMode(true);
          searchResults.current = [];
          searchResultIndex.current = -1;
          clearLine();
          term.write('\x1b[1;33m(reverse-i-search)`\x1b[0m: ');
        }
        return;
      }

      if (data === '\x03') { // Ctrl+C
        if (currentInput.current.length > 0) {
          term.write('^C\r\n');
          currentInput.current = '';
          historyIndex.current = history.current.length;
          writePrompt();
        } else {
          term.write('^C\r\n');
          writePrompt();
        }
        return;
      }

      if (data === '\x04') { // Ctrl+D (EOF/exit)
        if (currentInput.current.length === 0) {
          term.writeln('\r\n\x1b[1;31mexit\x1b[0m');
          onClose();
          return;
        }
        return;
      }

      if (data === '\x01') { // Ctrl+A (beginning of line)
        clearLine();
        term.write(getPrompt());
        currentInput.current = '';
        return;
      }

      if (data === '\x05') { // Ctrl+E (end of line)
        clearLine();
        term.write(getPrompt() + currentInput.current.replace(/\n/g, '\r\n'));
        return;
      }

      if (data === '\x0c') { // Ctrl+L (clear screen)
        term.clear();
        term.write(getPrompt());
        return;
      }

      if (data === '\t') { // Tab - completion
        if (currentInput.current) {
          const input = currentInput.current;
          const lastWord = input.split(' ').pop() || '';
          const cmdMatch = input.match(/^(\S+)/);
          const cmd = cmdMatch ? cmdMatch[1].toLowerCase() : '';
          
          const fileCommands = ['cat', 'cd', 'ls', 'rm', 'cp', 'mv', 'chmod', 'chown', 'grep', 'find', 'touch', './'];
          const gitFileCommands = ['add', 'rm', 'mv', 'checkout', 'restore', 'reset', 'diff', 'show', 'log', 'stash'];
          const isGitCmd = cmd === 'git';
          const parts = input.split(' ');
          const subCmd = parts.length > 1 ? parts[1].toLowerCase() : '';
          const isGitFileCmd = isGitCmd && gitFileCommands.includes(subCmd);
          const needsFile = fileCommands.includes(cmd) || cmd.endsWith('/') || isGitFileCmd;
          
          let matches: string[] = [];
          if (needsFile && (lastWord.length > 0 || cmd === 'ls' || cmd === 'cd')) {
            matches = await getFileCompletions(lastWord, cwd);
            if (matches.length === 1) {
              const newInput = input.slice(0, input.length - lastWord.length) + matches[0];
              currentInput.current = newInput;
              clearLine();
              term.write(getPrompt() + currentInput.current.replace(/\n/g, '\r\n'));
              return;
            }
          }
          
          if (matches.length === 0) {
            const parts = input.split(' ');
            const last = parts[parts.length - 1];
            const prefix = input.slice(0, input.length - last.length);
            matches = baseCompletions(last);
            if (matches.length === 1) {
              currentInput.current = prefix + matches[0];
              clearLine();
              term.write(getPrompt() + currentInput.current.replace(/\n/g, '\r\n'));
            } else if (matches.length > 1) {
              term.write('\r\n' + matches.join('  ').replace(/\n/g, '\r\n') + '\r\n');
              term.write(getPrompt() + currentInput.current.replace(/\n/g, '\r\n'));
            }
          } else if (matches.length > 1) {
            term.write('\r\n' + matches.join('  ').replace(/\n/g, '\r\n') + '\r\n');
            term.write(getPrompt() + currentInput.current.replace(/\n/g, '\r\n'));
          }
        }
        return;
      }

      if (data === '\x0b') { // Ctrl+K (clear to end of line)
        const prefix = currentInput.current;
        currentInput.current = '';
        clearLine();
        term.write(getPrompt() + prefix.replace(/\n/g, '\r\n'));
        return;
      }

      if (data === '\x15') { // Ctrl+U (clear entire line)
        currentInput.current = '';
        clearLine();
        term.write(getPrompt());
        return;
      }

      if (data === '\x1b[3~') { // Delete
        return;
      }

      if (data === '\x1b[1;5C' || data === '\x1bb') { // Alt+Right (word forward)
        return;
      }

      if (data === '\x1b[1;5D' || data === '\x1bf') { // Alt+Left (word backward)
        return;
      }

      if (data === '\x1bt') { // Ctrl+T (transpose)
        if (currentInput.current.length >= 2) {
          const lastTwo = currentInput.current.slice(-2);
          currentInput.current = currentInput.current.slice(0, -2) + lastTwo[1] + lastTwo[0];
          clearLine();
          term.write(getPrompt() + currentInput.current.replace(/\n/g, '\r\n'));
        }
        return;
      }

      if (code === 13) { // Enter
        const cmd = currentInput.current;
        term.write('\r\n');

        if (isSearchMode && searchResults.current.length > 0) {
          const idx = searchResults.current[searchResultIndex.current];
          currentInput.current = history.current[idx];
        }

        if (cmd.trim()) {
          addToHistory(cmd);
        }

        awaitExecute(cmd);
        
        setIsSearchMode(false);
        searchQuery.current = '';
        currentInput.current = '';
        historyIndex.current = history.current.length;
        writePrompt();
        return;
      }

      if (isSearchMode) {
        searchQuery.current += data;
        clearLine();
        term.write('\x1b[1;33m(reverse-i-search)`\x1b[0m' + searchQuery.current + '\x1b[0m: ');
        searchHistory(searchQuery.current);
        
        if (searchResults.current.length > 0) {
          const idx = searchResults.current[searchResultIndex.current];
          const cmd = history.current[idx];
          term.write('\r\n' + getPrompt() + cmd.replace(/\n/g, '\r\n'));
        }
        return;
      }

      if (code >= 32) {
        currentInput.current += data;
        term.write(data);
      }
    };

    term.onData(handleInput);

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    const handleTerminalWrite = (e: Event) => {
      const customEvent = e as CustomEvent;
      term.write(customEvent.detail.replace(/\n/g, '\r\n'));
    };
    window.addEventListener('terminal-write', handleTerminalWrite);

    return () => {
      term.dispose();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('terminal-write', handleTerminalWrite);
    };
  }, [addToHistory, clearLine, getPrompt, onClose, redrawInput, searchHistory, writePrompt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).closest('.xterm')) return;
    isDragging.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    setPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const awaitExecute = async (input: string) => {
    const cmd = input.trim();
    const term = xtermRef.current;
    if (!term) return;

    if (!cmd) {
      term.write(getPrompt());
      return;
    }

    if (cmd === 'clear' || cmd === 'cls') {
      term.clear();
      term.write(getPrompt());
      return;
    }

    if (cmd === 'history') {
      const list = history.current.map((c, i) => `\x1b[36m${i + 1}\x1b[0m  ${c}`).join('\r\n');
      if (list) term.writeln(list);
      term.write(getPrompt());
      return;
    }

    if (cmd.startsWith('!')) {
      const num = parseInt(cmd.slice(1));
      if (!isNaN(num) && num > 0 && num <= history.current.length) {
        const newCmd = history.current[num - 1];
        term.writeln(`\x1b[33m${newCmd}\x1b[0m`);
        awaitExecute(newCmd);
        return;
      }
      term.writeln('\x1b[31mbash: !: event not found\x1b[0m');
      term.write(getPrompt());
      return;
    }

    if (cmd === 'help') {
      term.writeln('\x1b[1;32mAvailable commands:\x1b[0m');
      term.writeln('  \x1b[33mclear\x1b[0m        - Clear terminal screen');
      term.writeln('  \x1b[33mhistory\x1b[0m     - Show command history');
      term.writeln('  \x1b[33m!<n>\x1b[0m        - Execute command <n> from history');
      term.writeln('  \x1b[1;31mCtrl+R\x1b[0m     - Reverse search history');
      term.writeln('  \x1b[1;31mUp/Down\x1b[0m     - Navigate history');
      term.writeln('  \x1b[1;31mCtrl+C\x1b[0m     - Interrupt command');
      term.writeln('  \x1b[1;31mCtrl+D\x1b[0m     - Exit terminal');
      term.writeln('  \x1b[1;31mCtrl+L\x1b[0m     - Clear screen');
      term.writeln('  \x1b[1;31mCtrl+A/E\x1b[0m    - Line beginning/end');
      term.writeln('  \x1b[1;31mCtrl+U/K\x1b[0m    - Clear line');
      term.writeln('  \x1b[1;31mTab\x1b[0m       - Command completion');
      term.write(getPrompt());
      return;
    }

    try {
      const result = await bashSystem.execute(cmd);
      
      if (result.stdout) {
        term.write(result.stdout.replace(/\n/g, '\r\n'));
      }
      if (result.stderr) {
        term.write('\x1b[31m' + result.stderr.replace(/\n/g, '\r\n') + '\x1b[0m');
      }

      setCwd(bashSystem.getCwd());

      const fsModifyingCommands = /^(mkdir|rmdir|rm|cp|mv|touch|cat\s+.*>\s*|echo\s+.*>\s*|tee|chmod|chown)/;
      if (fsModifyingCommands.test(cmd.trim())) {
        window.dispatchEvent(new CustomEvent('filesystem-changed'));
      }
    } catch (err: any) {
      term.write('\x1b[31mError: ' + err.message + '\x1b[0m\r\n');
    }

    term.write(getPrompt());
  };

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        isMaximized ? 'inset-0' : 'w-[900px] h-[500px]'
      }`}
      style={isMaximized ? {} : { left: `${position.x}px`, top: `${position.y}px` }}
    >
      <div className="flex flex-col h-full bg-[#0d1117] rounded-xl border border-[#30363d] shadow-2xl overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d] cursor-move"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <button
                className="w-3 h-3 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 transition-colors"
              />
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="w-3 h-3 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 transition-colors flex items-center justify-center group"
              >
                {isMaximized ? <Minimize2 className="w-2 h-2 text-[#0d1117] opacity-0 group-hover:opacity-100 transition-opacity" /> : <Maximize2 className="w-2 h-2 text-[#0d1117] opacity-0 group-hover:opacity-100 transition-opacity" />}
              </button>
            </div>
            <span className="text-xs font-mono text-[#8b949e]">bash — {cwd}</span>
          </div>
          <div className="flex items-center gap-2">
            {isSearchMode && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-[#0d1117] rounded-md border border-[#30363d]">
                <Search className="w-3 h-3 text-[#f0883e]" />
                <span className="text-xs text-[#8b949e]">reverse-i-search</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-red-500/20 rounded transition-colors"
              title="Close Terminal"
            >
              <X className="w-4 h-4 text-[#8b949e] hover:text-red-400 transition-colors" />
            </button>
          </div>
        </div>
        <div ref={terminalRef} className="flex-1 overflow-hidden" />
      </div>
    </div>
  );
};
