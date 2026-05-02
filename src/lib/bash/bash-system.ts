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
    this.fs = new LightningFSAdapter('gemma-agent-fs');
    this.bash = new Bash({
      fs: this.fs,
      cwd: this.currentCwd,
      customCommands: [gitCommand, catCommand, piCommand, mcpCommand, appsListCommand, fsExportCommand, fsImportCommand],
      env: {
        USER: 'gemma',
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
    } catch (e) {
      console.error('Failed to initialize FS paths', e);
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
