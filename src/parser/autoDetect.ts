import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface SessionFile {
  path: string;
  mtime: number;
}

export function findLatestSession(): string | null {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  try {
    const files = collectSessionFiles(claudeDir);
    if (files.length === 0) return null;
    files.sort((a, b) => b.mtime - a.mtime);
    return files[0].path;
  } catch {
    return null;
  }
}

function collectSessionFiles(dir: string): SessionFile[] {
  const results: SessionFile[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSessionFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl') && !dir.includes('/subagents')) {
      try {
        const stat = fs.statSync(fullPath);
        results.push({ path: fullPath, mtime: stat.mtimeMs });
      } catch {
        // skip inaccessible file
      }
    }
  }
  return results;
}
