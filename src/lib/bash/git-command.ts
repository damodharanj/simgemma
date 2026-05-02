import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { defineCommand } from 'just-bash';

export const gitCommand = defineCommand('git', async (args, ctx): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  const subcommand = args[0];
  const commandArgs = args.slice(1);

  if (!subcommand) {
    return { stdout: '', stderr: 'usage: git <command> [<args>]\n', exitCode: 1 };
  }

  // Common git command mapping
  const fs = (ctx.fs as any).getGitFS ? (ctx.fs as any).getGitFS() : ctx.fs;
  const dir = ctx.cwd;

  try {
    switch (subcommand) {
      case 'clone': {
        const url = commandArgs[0];
        const targetDir = commandArgs[1] || url.split('/').pop()?.replace('.git', '') || 'repo';
        const absoluteTargetDir = ctx.fs.resolvePath(dir, targetDir);
        
        await git.clone({
          fs,
          http,
          dir: absoluteTargetDir,
          url,
          singleBranch: true,
          depth: 1,
        });
        return { stdout: `Cloned into '${targetDir}'\n`, stderr: '', exitCode: 0 };
      }

      case 'status': {
        const statuses = await git.statusMatrix({ fs, dir });
        // Simplified status output
        let output = '';
        for (const row of statuses) {
          const [filepath, head, workdir, _stage] = row;
          if (head !== workdir || workdir !== _stage) {
            output += `${filepath}: ${head} ${workdir} ${_stage}\n`;
          }

        }
        return { stdout: output || 'nothing to commit, working tree clean\n', stderr: '', exitCode: 0 };
      }

      case 'log': {
        const logs = await git.log({ fs, dir, depth: 10 });
        let output = '';
        for (const log of logs) {
          output += `commit ${log.oid}\nAuthor: ${log.commit.author.name} <${log.commit.author.email}>\nDate: ${new Date(log.commit.author.timestamp * 1000).toString()}\n\n    ${log.commit.message}\n\n`;
        }
        return { stdout: output, stderr: '', exitCode: 0 };
      }

      case 'add': {
        for (const file of commandArgs) {
          await git.add({ fs, dir, filepath: file });
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      case 'commit': {
        const messageArgIdx = commandArgs.indexOf('-m');
        const message = messageArgIdx !== -1 ? commandArgs[messageArgIdx + 1] : 'Update';
        const sha = await git.commit({
          fs,
          dir,
          message,
          author: { name: 'Gemma Agent', email: 'agent@gemma.local' }
        });
        return { stdout: `[main ${sha.substring(0, 7)}] ${message}\n`, stderr: '', exitCode: 0 };
      }
      
      case 'config': {
          // Placeholder for config setting
          return { stdout: 'Config set (simulated)\n', stderr: '', exitCode: 0 };
      }

case 'branch': {
          const branches = await git.listBranches({ fs, dir });
          return { stdout: branches.join('\n') + '\n', stderr: '', exitCode: 0 };
        }

      case 'push': {
        const remote = commandArgs[0] || 'origin';
        const branch = commandArgs[1] || 'main';
        await git.push({
          fs,
          http,
          dir,
          remote,
          ref: branch,
        });
        return { stdout: `Pushed to ${remote}/${branch}\n`, stderr: '', exitCode: 0 };
      }

      case 'pull': {
        const remote = commandArgs[0] || 'origin';
        const branch = commandArgs[1] || 'main';
        await git.pull({
          fs,
          http,
          dir,
          author: { name: 'Gemma Agent', email: 'agent@gemma.local' },
          remote,
          ref: branch,
        });
        return { stdout: `Pulled from ${remote}/${branch}\n`, stderr: '', exitCode: 0 };
      }

      case 'fetch': {
        const remote = commandArgs[0] || 'origin';
        await git.fetch({
          fs,
          http,
          dir,
          remote,
        });
        return { stdout: `Fetched from ${remote}\n`, stderr: '', exitCode: 0 };
      }

      case 'checkout': {
        const branchName = commandArgs[0];
        if (!branchName) {
          return { stdout: '', stderr: 'error: branch name required\n', exitCode: 1 };
        }
        const branches = await git.listBranches({ fs, dir });
        if (branches.includes(branchName)) {
          await git.checkout({
            fs,
            dir,
            ref: branchName,
          });
          return { stdout: `Switched to branch '${branchName}'\n`, stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: `error: branch '${branchName}' not found\n`, exitCode: 1 };
      }

      case 'diff': {
        const statuses = await git.statusMatrix({ fs, dir });
        let output = '';
        for (const row of statuses) {
          const [filepath, head, workdir, _stage] = row;
          if (head !== workdir) {
            output += `M ${filepath}\n`;
          }
        }
        return { stdout: output || 'No changes\n', stderr: '', exitCode: 0 };
      }

      case 'remote': {
        if (commandArgs[0] === '-v') {
          return { stdout: 'origin  (fetch)\norigin  (push)\n', stderr: '', exitCode: 0 };
        }
        return { stdout: 'origin\n', stderr: '', exitCode: 0 };
      }

      case 'init': {
        const dirPath = commandArgs[0] || '.';
        const absolutePath = ctx.fs.resolvePath(dir, dirPath);
        await git.init({ fs, dir: absolutePath });
        return { stdout: `Initialized empty Git repository in ${dirPath}/.git/\n`, stderr: '', exitCode: 0 };
      }

      case 'reset': {
        const hardIdx = commandArgs.indexOf('--hard');
        const softIdx = commandArgs.indexOf('--soft');
        if (hardIdx !== -1 || softIdx !== -1) {
          return { stdout: 'Reset performed (simulated)\n', stderr: '', exitCode: 0 };
        }
        return { stdout: 'Reset to HEAD\n', stderr: '', exitCode: 0 };
      }

      case 'show': {
        commandArgs[0] || 'HEAD';
        const commits = await git.log({ fs, dir, depth: 1 });
        if (commits.length > 0) {
          const commit = commits[0];
          return { stdout: `commit ${commit.oid}\nAuthor: ${commit.commit.author.name} <${commit.commit.author.email}>\nDate: ${new Date(commit.commit.author.timestamp * 1000).toString()}\n\n    ${commit.commit.message}\n`, stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: 'fatal: bad object\n', exitCode: 1 };
      }

      case 'rev-parse': {
        const type = commandArgs[0];
        if (type === '--short') {
          const commits = await git.log({ fs, dir, depth: 1 });
          if (commits.length > 0) {
            return { stdout: commits[0].oid.substring(0, 7) + '\n', stderr: '', exitCode: 0 };
          }
        }
        if (type === '--abbrev-ref') {
          return { stdout: 'main\n', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      case 'stash': {
        if (commandArgs[0] === 'pop' || commandArgs[0] === 'list' || !commandArgs[0]) {
          return { stdout: 'No stash entries\n', stderr: '', exitCode: 0 };
        }
        await git.stash({ fs, dir });
        return { stdout: 'Saved working directory\n', stderr: '', exitCode: 0 };
      }

      case 'merge': {
        const branch = commandArgs[0];
        if (!branch) {
          return { stdout: '', stderr: 'error: no branch specified\n', exitCode: 1 };
        }
        return { stdout: `Merged ${branch} (simulated)\n`, stderr: '', exitCode: 0 };
      }

      case 'rebase': {
        const branch = commandArgs[0] || 'main';
        return { stdout: `Rebased onto ${branch} (simulated)\n`, stderr: '', exitCode: 0 };
      }

      case 'tag': {
        const tagName = commandArgs[0];
        if (!tagName) {
          const tags = await git.listTags({ fs, dir });
          return { stdout: tags.join('\n') + '\n', stderr: '', exitCode: 0 };
        }
        return { stdout: `Created tag ${tagName} (simulated)\n`, stderr: '', exitCode: 0 };
      }

      case 'clean': {
        return { stdout: 'Cleaned (simulated)\n', stderr: '', exitCode: 0 };
      }

      case 'mv': {
        const fIdx = commandArgs.indexOf('-f');
        const source = commandArgs[fIdx + 1];
        const dest = commandArgs[fIdx + 2];
        if (!source || !dest) {
          return { stdout: '', stderr: 'error: source and dest required\n', exitCode: 1 };
        }
        const absSource = ctx.fs.resolvePath(dir, source);
        const absDest = ctx.fs.resolvePath(dir, dest);
        const content = await ctx.fs.readFile(absSource);
        await ctx.fs.writeFile(absDest, content);
        await ctx.fs.rm(absSource);
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      case 'rm': {
        for (const file of commandArgs) {
          if (!file.startsWith('-')) {
            const absPath = ctx.fs.resolvePath(dir, file);
            await ctx.fs.rm(absPath);
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }

      default:
        if (typeof (git as any)[subcommand] === 'function') {
           return { stdout: '', stderr: `git command '${subcommand}' is not yet fully implemented in this browser tool.\n`, exitCode: 1 };
        }
        return { stdout: '', stderr: `git: '${subcommand}' is not a git command. See 'git --help'.\n`, exitCode: 1 };
    }
  } catch (err: any) {
    return { stdout: '', stderr: `fatal: ${err.message}\n`, exitCode: 1 };
  }
});
