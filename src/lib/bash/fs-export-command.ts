import { defineCommand } from 'just-bash';

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  content?: string;
  encoding?: 'utf8' | 'base64';
}

interface ExportData {
  version: string;
  exportedAt: string;
  files: FileEntry[];
}

async function walkDirectory(fs: any, dirPath: string, files: FileEntry[]): Promise<void> {
  const entries = await fs.readdir(dirPath);

  for (const entry of entries) {
    const fullPath = `${dirPath}/${entry}`;
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory) {
      files.push({ path: fullPath, type: 'directory' });
      await walkDirectory(fs, fullPath, files);
    } else if (stat.isFile) {
      const content = await fs.readFile(fullPath);
      files.push({
        path: fullPath,
        type: 'file',
        content,
        encoding: 'utf8'
      });
    }
  }
}

export const fsExportCommand = defineCommand('fs-export', async (args, ctx) => {
  try {
    const startPath = args[0] || '/home/user';
    const files: FileEntry[] = [];

    const exists = await ctx.fs.exists(startPath);
    if (!exists) {
      return { stdout: '', stderr: `fs-export: ${startPath}: No such file or directory\n`, exitCode: 1 };
    }

    const stat = await ctx.fs.stat(startPath);
    if (stat.isFile) {
      const content = await ctx.fs.readFile(startPath);
      files.push({
        path: startPath,
        type: 'file',
        content,
        encoding: 'utf8'
      });
    } else {
      files.push({ path: startPath, type: 'directory' });
      await walkDirectory(ctx.fs, startPath, files);
    }

    const exportData: ExportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      files
    };

    return { stdout: JSON.stringify(exportData, null, 2) + '\n', stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `fs-export: Error: ${err.message}\n`, exitCode: 1 };
  }
});
