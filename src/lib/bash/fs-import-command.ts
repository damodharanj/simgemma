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

export const fsImportCommand = defineCommand('fs-import', async (args, ctx) => {
  try {
    let jsonInput: string;

    if (args.length > 0) {
      const filePath = args[0];
      const absolutePath = ctx.fs.resolvePath(ctx.cwd, filePath);
      const exists = await ctx.fs.exists(absolutePath);
      if (!exists) {
        return { stdout: '', stderr: `fs-import: ${filePath}: No such file or directory\n`, exitCode: 1 };
      }
      jsonInput = await ctx.fs.readFile(absolutePath);
    } else {
      if (!ctx.stdin) {
        return { stdout: '', stderr: 'fs-import: No input provided. Provide a file path or pipe JSON via stdin.\n', exitCode: 1 };
      }
      jsonInput = ctx.stdin;
    }

    let exportData: ExportData;
    try {
      exportData = JSON.parse(jsonInput);
    } catch {
      return { stdout: '', stderr: 'fs-import: Invalid JSON format\n', exitCode: 1 };
    }

    if (!exportData.files || !Array.isArray(exportData.files)) {
      return { stdout: '', stderr: 'fs-import: Invalid export data format\n', exitCode: 1 };
    }

    let imported = 0;
    let skipped = 0;

    for (const entry of exportData.files) {
      try {
        if (entry.type === 'directory') {
          await ctx.fs.mkdir(entry.path, { recursive: true });
          imported++;
        } else if (entry.type === 'file') {
          const dirPath = entry.path.split('/').slice(0, -1).join('/') || '/';
          if (dirPath) {
            await ctx.fs.mkdir(dirPath, { recursive: true }).catch(() => {});
          }

          if (entry.encoding === 'base64' && entry.content) {
            const binaryStr = atob(entry.content);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            await ctx.fs.writeFile(entry.path, bytes);
          } else {
            await ctx.fs.writeFile(entry.path, entry.content || '');
          }
          imported++;
        }
      } catch (err: any) {
        skipped++;
      }
    }

    return {
      stdout: `Imported ${imported} items${skipped > 0 ? `, skipped ${skipped}` : ''}.\n`,
      stderr: '',
      exitCode: 0
    };
  } catch (err: any) {
    return { stdout: '', stderr: `fs-import: Error: ${err.message}\n`, exitCode: 1 };
  }
});
