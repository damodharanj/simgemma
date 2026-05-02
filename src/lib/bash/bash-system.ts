import { Bash } from 'just-bash';
import { LightningFSAdapter } from './lightning-fs-adapter';
import { gitCommand } from './git-command';
import { catCommand } from './cat-command';
import { piCommand } from './pi-command';
import { mcpCommand } from './mcp-command';
import { appsListCommand } from './apps-list-command';
export class BashSystem {
  private static instance: BashSystem;
  public bash: Bash;
  public fs: LightningFSAdapter;

  private constructor() {
    this.fs = new LightningFSAdapter('gemma-agent-fs');
    this.bash = new Bash({
      fs: this.fs,
      cwd: '/home/user',
      customCommands: [gitCommand, catCommand, piCommand, mcpCommand, appsListCommand],
      env: {
        USER: 'gemma',
        HOME: '/home/user',
        PATH: '/bin:/usr/bin',
      }
    });

    // Ensure home directory exists
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

  async execute(command: string) {
    return await this.bash.exec(command);
  }
}
