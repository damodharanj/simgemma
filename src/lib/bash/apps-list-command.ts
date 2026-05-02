import { defineCommand } from 'just-bash';

export const appsListCommand = defineCommand('apps-list', async (_args, ctx) => {
  const appsDir = '/home/user/apps';
  
  try {
    const exists = await ctx.fs.exists(appsDir);
    if (!exists) {
      return { stdout: 'No apps directory found.\n', stderr: '', exitCode: 0 };
    }
    
    const entries = await ctx.fs.readdir(appsDir);
    const appDirs: string[] = [];
    
    for (const entry of entries) {
      try {
        const stat = await ctx.fs.stat(`${appsDir}/${entry}`);
        if (stat.isDirectory) {
          appDirs.push(entry);
        }
      } catch {
        // Skip entries we can't stat
      }
    }
    
    if (appDirs.length === 0) {
      return { stdout: 'No apps found.\n', stderr: '', exitCode: 0 };
    }
    
    const output: string[] = [];
    for (const app of appDirs) {
      const indexPath = `${appsDir}/${app}/index.html`;
      const hasIndex = await ctx.fs.exists(indexPath);
      output.push(`${app}${hasIndex ? ' (has index.html)' : ' (empty)'}`);
    }
    
    return { stdout: output.join('\n') + '\n', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `Error listing apps: ${err.message}\n`, exitCode: 1 };
  }
});
