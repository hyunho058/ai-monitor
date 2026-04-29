import chalk from 'chalk';
import { State, FileActivity } from '../../types/state.js';
import * as path from 'path';

const OP_LABELS: Record<FileActivity['operation'], string> = {
  read: 'READ ',
  write: 'WRITE',
  grep: 'GREP ',
  list: 'LIST ',
  other: 'FILE ',
};

const OP_COLORS: Record<FileActivity['operation'], (s: string) => string> = {
  read: chalk.blue,
  write: chalk.magenta,
  grep: chalk.cyan,
  list: chalk.yellow,
  other: chalk.white,
};

function fmtPath(filePath: string, maxLen: number): string {
  const base = path.basename(filePath);
  if (base.length <= maxLen) return base;
  return base.slice(0, maxLen - 1) + '…';
}

export function renderFileActivityBox(state: State, cols: number): string {
  const maxPath = Math.max(16, cols - 22);
  const activities = state.fileActivities.slice(0, 5);

  const lines: string[] = [];

  if (activities.length === 0) {
    lines.push(chalk.dim('  (no file activity)'));
  } else {
    for (const act of activities) {
      const opLabel = OP_LABELS[act.operation];
      const colorFn = OP_COLORS[act.operation];
      const statusIcon = act.status === 'success'
        ? chalk.green('✓')
        : act.status === 'failure'
          ? chalk.red('✗')
          : chalk.yellow('…');
      const filePart = fmtPath(act.path, maxPath).padEnd(maxPath);
      lines.push(`  ${colorFn(opLabel)} ${statusIcon} ${chalk.dim(filePart)}`);
    }
  }

  return chalk.bold.cyan('File Activity') + '\n' + lines.join('\n');
}
