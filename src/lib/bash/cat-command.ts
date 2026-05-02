import { defineCommand } from 'just-bash';

export const catCommand = defineCommand('cat', async (args, ctx) => {
  if (args.length === 0) {
    return { stdout: ctx.stdin || '', stderr: '', exitCode: 0 };
  }
  let stdout = '';
  for (const file of args) {
    // Avoid flags like -n for now just do basic cat
    if (file.startsWith('-')) continue;
    
    try {
      const absolutePath = ctx.fs.resolvePath(ctx.cwd, file);
      // Ensure file exists and is not a directory
      const stat = await ctx.fs.stat(absolutePath);
      if (stat.isDirectory) {
          return { stdout, stderr: `cat: ${file}: Is a directory\n`, exitCode: 1 };
      }
      const content = await ctx.fs.readFile(absolutePath);
      stdout += content;
    } catch (err: any) {
      return { stdout, stderr: `cat: ${file}: No such file or directory\n`, exitCode: 1 };
    }
  }
  return { stdout, stderr: '', exitCode: 0 };
});
