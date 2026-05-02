// @ts-nocheck
import FS from '@isomorphic-git/lightning-fs';
import type { 
  IFileSystem, 
  ReadFileOptions, 
  BufferEncoding, 
  WriteFileOptions, 
  FsStat, 
  MkdirOptions, 
  RmOptions, 
  CpOptions,
  DirentEntry,
  FileContent
} from 'just-bash';
import path from 'path-browserify';

export class LightningFSAdapter implements IFileSystem {
  private fs: any;
  private promises: any;

  constructor(name: string) {
    this.fs = new FS(name);
    this.promises = this.fs.promises;
  }

  async readFile(pathStr: string, options?: ReadFileOptions | BufferEncoding): Promise<string> {
    let encoding = typeof options === 'string' ? options : options?.encoding;
    if (encoding === 'utf-8') encoding = 'utf8';
    const content = await this.promises.readFile(pathStr, { encoding: encoding || 'utf8' });
    if (content instanceof Uint8Array) {
      return new TextDecoder().decode(content);
    }
    return content.toString();
  }


  async readFileBuffer(pathStr: string): Promise<Uint8Array> {
    const content = await this.promises.readFile(pathStr);
    return new Uint8Array(content);
  }

  async writeFile(pathStr: string, content: FileContent, options?: WriteFileOptions | BufferEncoding): Promise<void> {
    const strContent = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
    await this.promises.writeFile(pathStr, strContent, { encoding: 'utf8' });
  }

  async appendFile(pathStr: string, content: FileContent, options?: WriteFileOptions | BufferEncoding): Promise<void> {
    // LightningFS doesn't have native appendFile, so we read and write
    let existing: Uint8Array;
    try {
      existing = await this.readFileBuffer(pathStr);
    } catch {
      existing = new Uint8Array(0);
    }
    
    const newContent = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const combined = new Uint8Array(existing.length + newContent.length);
    combined.set(existing);
    combined.set(newContent, existing.length);
    
    await this.writeFile(pathStr, combined);
  }

  async exists(pathStr: string): Promise<boolean> {
    try {
      await this.promises.stat(pathStr);
      return true;
    } catch {
      return false;
    }
  }

  async stat(pathStr: string): Promise<FsStat> {
    const s = await this.promises.stat(pathStr);
    return {
      isFile: s.type === 'file',
      isDirectory: s.type === 'dir',
      isSymbolicLink: s.type === 'symlink',
      mode: s.mode || 0o644,
      size: s.size,
      mtime: new Date(s.mtime)
    };
  }

  async lstat(pathStr: string): Promise<FsStat> {
    const s = await this.promises.lstat(pathStr);
    return {
      isFile: s.type === 'file',
      isDirectory: s.type === 'dir',
      isSymbolicLink: s.type === 'symlink',
      mode: s.mode || 0o644,
      size: s.size,
      mtime: new Date(s.mtime)
    };
  }

  async mkdir(pathStr: string, options?: MkdirOptions): Promise<void> {
    if (options?.recursive) {
      const parts = pathStr.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += '/' + part;
        if (!(await this.exists(current))) {
          await this.promises.mkdir(current);
        }
      }
    } else {
      await this.promises.mkdir(pathStr);
    }
  }

  async readdir(pathStr: string): Promise<string[]> {
    return await this.promises.readdir(pathStr);
  }

  async readdirWithFileTypes(pathStr: string): Promise<DirentEntry[]> {
    const files = await this.readdir(pathStr);
    return await Promise.all(files.map(async (name) => {
      const s = await this.stat(path.join(pathStr, name));
      return {
        name,
        isFile: s.isFile,
        isDirectory: s.isDirectory,
        isSymbolicLink: s.isSymbolicLink
      };
    }));
  }

  async rm(pathStr: string, options?: RmOptions): Promise<void> {
    const isDir = (await this.stat(pathStr)).isDirectory;
    if (isDir) {
      if (options?.recursive) {
        const files = await this.readdir(pathStr);
        for (const file of files) {
          await this.rm(path.join(pathStr, file), options);
        }
        await this.promises.rmdir(pathStr);
      } else {
        await this.promises.rmdir(pathStr);
      }
    } else {
      await this.promises.unlink(pathStr);
    }
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const s = await this.stat(src);
    if (s.isDirectory) {
      if (!options?.recursive) throw new Error(`${src} is a directory (not copied)`);
      await this.mkdir(dest, { recursive: true });
      const files = await this.readdir(src);
      for (const file of files) {
        await this.cp(path.join(src, file), path.join(dest, file), options);
      }
    } else {
      const content = await this.readFileBuffer(src);
      await this.writeFile(dest, content);
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.promises.rename(src, dest);
  }

  resolvePath(base: string, pathStr: string): string {
    if (pathStr.startsWith('/')) {
      return pathStr;
    }
    // ensure base starts with /
    let res = path.join(base.startsWith('/') ? base : '/' + base, pathStr);
    return path.normalize(res);
  }

  getAllPaths(): string[] {
    // This is optional and hard to implement efficiently with LightningFS index without walking
    return [];
  }

  async chmod(_pathStr: string, _mode: number): Promise<void> {
    // LightningFS doesn't natively support chmod
  }


  async symlink(target: string, linkPath: string): Promise<void> {
    await this.promises.symlink(target, linkPath);
  }

  async link(_existingPath: string, _newPath: string): Promise<void> {
    // LightningFS doesn't support hard links natively
    throw new Error('Hard links not supported by LightningFS');
  }


  async readlink(pathStr: string): Promise<string> {
    return await this.promises.readlink(pathStr);
  }

  async realpath(pathStr: string): Promise<string> {
    // Basic realpath implementation
    let current = pathStr;
    if (!path.isAbsolute(current)) current = path.join('/', current);
    
    // In a real implementation we would resolve symlinks step by step
    return path.normalize(current);
  }

  async utimes(pathStr: string, atime: Date, mtime: Date): Promise<void> {
    await this.promises.utimes(pathStr, atime.getTime(), mtime.getTime());
  }

  // Helper for isomorphic-git which needs a Node-like fs object
  getGitFS() {
    return this.fs;
  }
}
