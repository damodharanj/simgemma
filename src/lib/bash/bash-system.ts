import { Bash } from 'just-bash';
import { LightningFSAdapter } from './lightning-fs-adapter';
import { gitCommand } from './git-command';
import { catCommand } from './cat-command';
import { piCommand } from './pi-command';
import { mcpCommand } from './mcp-command';
import { appsListCommand } from './apps-list-command';
import { fsExportCommand } from './fs-export-command';
import { fsImportCommand } from './fs-import-command';

export class BashSystem {
  private static instance: BashSystem;
  public bash: Bash;
  public fs: LightningFSAdapter;
  private currentCwd: string;

  private constructor() {
    this.currentCwd = '/home/user';
    this.fs = new LightningFSAdapter('simgemma-fs');
    this.bash = new Bash({
      fs: this.fs,
      cwd: this.currentCwd,
      customCommands: [gitCommand, catCommand, piCommand, mcpCommand, appsListCommand, fsExportCommand, fsImportCommand],
      env: {
        USER: 'simgemma',
        HOME: '/home/user',
        PATH: '/bin:/usr/bin',
      }
    });

    this.init();
  }

  private async init() {
    try {
      if (!(await this.fs.exists('/home/user'))) {
        await this.fs.mkdir('/home/user', { recursive: true });
      }
      if (!(await this.fs.exists('/home/user/mcp.json'))) {
        await this.fs.writeFile('/home/user/mcp.json', '{\n  "mcpServers": {\n}\n}');
      }
      if (!(await this.fs.exists('/home/user/apps'))) {
        await this.fs.mkdir('/home/user/apps', { recursive: true });
      }
      if (!(await this.fs.exists('/home/user/AGENTS.md'))) {
        try {
          const response = await fetch('/AGENTS.md');
          if (response.ok) {
            const content = await response.text();
            await this.fs.writeFile('/home/user/AGENTS.md', content);
          }
        } catch (e) {
          console.error('Failed to fetch AGENTS.md', e);
        }
      }

      // Check if already initialized with default files
      if (!(await this.fs.exists('/.initialized'))) {
        await this.initDefaultFiles();
      }
    } catch (e) {
      console.error('Failed to initialize FS paths', e);
    }
  }

  private async initDefaultFiles() {
    try {
      console.log('Initializing default files from assets/default.json...');
      const response = await fetch('/assets/default.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch default.json: ${response.statusText}`);
      }
      const data = await response.text();
      
      const tempPath = '/tmp/default-import.json';
      if (!(await this.fs.exists('/tmp'))) {
        await this.fs.mkdir('/tmp', { recursive: true });
      }
      
      await this.fs.writeFile(tempPath, data);
      const result = await this.execute(`fs-import ${tempPath}`);
      
      if (result.exitCode === 0) {
        await this.fs.writeFile('/.initialized', 'true');
        console.log('Default files initialized successfully');
        window.dispatchEvent(new CustomEvent('filesystem-changed'));
      } else {
        console.error('Failed to import default files:', result.stderr);
      }
      
      await this.fs.rm(tempPath).catch(() => {});
    } catch (e) {
      console.error('Error during default files initialization:', e);
    }
  }

  public static getInstance(): BashSystem {
    if (!BashSystem.instance) {
      BashSystem.instance = new BashSystem();
    }
    return BashSystem.instance;
  }

  public getCwd(): string {
    return this.currentCwd;
  }

  async execute(command: string) {
    const result = await this.bash.exec(command, { cwd: this.currentCwd });

    if (result.env?.PWD) {
      this.currentCwd = result.env.PWD;
    }

    return result;
  }
}
