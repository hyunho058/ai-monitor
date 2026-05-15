import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionEntry {
  path: string;
  mtime: number;
  provider: 'claude' | 'gemini';
}

export function findLatestSession(): string | null {
  const sessions = findAllSessions();
  return sessions.length > 0 ? sessions[0].path : null;
}

const SESSION_MAX_AGE_MS = 15 * 60 * 1000;
const GEMINI_MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000;

export function findAllSessions(): SessionEntry[] {
  const cutoff = Date.now() - SESSION_MAX_AGE_MS;
  const geminiCutoff = Date.now() - GEMINI_MAX_AGE_MS;
  const results: SessionEntry[] = [];

  // Claude sessions
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  try {
    const claudeFiles = collectClaudeFiles(claudeDir).filter(f => f.mtime >= cutoff);
    results.push(...claudeFiles);
  } catch {
    // ignore if directory doesn't exist
  }

  // Gemini sessions
  const geminiTmpDir = path.join(os.homedir(), '.gemini', 'tmp');
  try {
    const geminiFiles = collectGeminiFiles(geminiTmpDir).filter(f => f.mtime >= geminiCutoff);
    results.push(...geminiFiles);
  } catch {
    // ignore if directory doesn't exist
  }

  results.sort((a, b) => b.mtime - a.mtime);
  return results;
}

function collectClaudeFiles(dir: string): SessionEntry[] {
  const results: SessionEntry[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectClaudeFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl') && !dir.includes('/subagents')) {
      try {
        const stat = fs.statSync(fullPath);
        results.push({ path: fullPath, mtime: stat.mtimeMs, provider: 'claude' });
      } catch {
        // skip inaccessible file
      }
    }
  }
  return results;
}

function collectGeminiFiles(tmpDir: string): SessionEntry[] {
  const results: SessionEntry[] = [];
  let hashDirs: fs.Dirent[];
  try {
    hashDirs = fs.readdirSync(tmpDir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const hashEntry of hashDirs) {
    if (!hashEntry.isDirectory()) continue;
    const chatsDir = path.join(tmpDir, hashEntry.name, 'chats');
    let chatFiles: fs.Dirent[];
    try {
      chatFiles = fs.readdirSync(chatsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const chatEntry of chatFiles) {
      if (!chatEntry.isFile()) continue;
      const name = chatEntry.name;
      if (!name.endsWith('.jsonl') && !name.endsWith('.json')) continue;
      const fullPath = path.join(chatsDir, name);
      try {
        const stat = fs.statSync(fullPath);
        results.push({ path: fullPath, mtime: stat.mtimeMs, provider: 'gemini' });
      } catch {
        // skip inaccessible file
      }
    }
  }
  return results;
}
