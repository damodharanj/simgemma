import { BashSystem } from './bash-system';

export interface ToolResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GemmaToolCall {
  name: string;
  arguments: Record<string, any>;
}

export class AgentTools {
  private static ARTIFACT_REGEX = /<artifact>([\s\S]*?)<\/artifact>/g;

  /**
   * Parses Gemma 4 native tool call format AND <bash> tags.
   * Handles both tokenized and non-tokenized output formats.
   * Supports nested JSON objects in arguments.
   */
  static parseGemmaToolCall(text: string): GemmaToolCall | null {
    // First check for <bash> tags (per AGENTS.md spec)
    const bashTagMatch = text.match(/<bash>([\s\S]*?)<\/bash>/);
    if (bashTagMatch) {
      return {
        name: 'bash_execute',
        arguments: { command: bashTagMatch[1].trim() }
      };
    }

    // Find the tool call pattern: call:name{...}
    const callMatch = text.match(/call:(\w+)\{/);
    if (!callMatch) return null;

    const name = callMatch[1];
    const startIdx = callMatch.index! + callMatch[0].length - 1; // Position after opening {

    // Find the matching closing } by tracking brace depth
    let braceDepth = 1;
    let endIdx = startIdx;
    let inString = false;
    let stringChar = '';

    for (let i = startIdx + 1; i < text.length; i++) {
      const char = text[i];

      if (inString) {
        if (char === stringChar && text[i - 1] !== '\\') {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '{') braceDepth++;
      if (char === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (braceDepth !== 0) return null; // Unbalanced braces

    const argsRaw = text.substring(startIdx + 1, endIdx);
    const args: Record<string, any> = {};

    // Parse key:value pairs (handles nested objects)
    const argPairs = this.splitTopLevel(argsRaw, ',');

    for (const pair of argPairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;

      const key = pair.substring(0, colonIndex).trim();
      let valueRaw = pair.substring(colonIndex + 1).trim();

      // Try to parse as JSON first, then fall back to string
      try {
        args[key] = JSON.parse(valueRaw);
      } catch {
        // Handle non-JSON values
        if ((valueRaw.startsWith('"') && valueRaw.endsWith('"')) ||
            (valueRaw.startsWith("'") && valueRaw.endsWith("'"))) {
          args[key] = valueRaw.slice(1, -1);
        } else {
          args[key] = valueRaw;
        }
      }
    }

    return { name, arguments: args };
  }

  /**
   * Splits a string by a delimiter, but only at the top level (not inside nested objects/strings).
   */
  private static splitTopLevel(str: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let braceDepth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (inString) {
        current += char;
        if (char === stringChar && str[i - 1] !== '\\') {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        current += char;
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '{' || char === '[') {
        braceDepth++;
        current += char;
        continue;
      }

      if (char === '}' || char === ']') {
        braceDepth--;
        current += char;
        continue;
      }

      if (char === delimiter && braceDepth === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    if (current.trim()) result.push(current.trim());
    return result;
  }

  /**
   * Scans a string for <artifact>...</artifact> tags and returns all matches.
   */
  static parseHtmlArtifact(text: string): string | null {
    const match = text.match(this.ARTIFACT_REGEX);
    return match ? match[1].trim() : null;
  }

  /**
   * Executes a bash command and returns the results.
   */
  static async executeBash(command: string): Promise<ToolResult> {
    const system = BashSystem.getInstance();
    const result = await system.execute(command);

    return {
      command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    };
  }

  /**
   * Formats a tool result into a system message for the AI.
   */
  static formatToolResult(result: ToolResult): string {
    let output = `[Command Execution Result]\nCommand: ${result.command}\n`;
    if (result.stdout) output += `STDOUT:\n${result.stdout}\n`;
    if (result.stderr) output += `STDERR:\n${result.stderr}\n`;
    output += `Exit Code: ${result.exitCode}`;
    return output;
  }
}
