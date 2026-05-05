import chalk from 'chalk';
import { State, Task } from '../../types/state.js';
import { sectionTitleDouble, sectionBottomDouble } from './utils.js';

function fmtDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

function statusIcon(task: Task): string {
  if (task.status === 'active') return chalk.yellow('◉');
  if (task.status === 'completed') return chalk.green('✓');
  return chalk.red('✗');
}

export function renderTasksBox(state: State, cols: number): string {
  const maxDesc = Math.max(20, cols - 24);
  const tasks = state.tasks;

  const lines: string[] = [];

  if (tasks.length === 0) {
    lines.push(chalk.dim('  (no top-level tasks)'));
  } else {
    for (const task of tasks) {
      const icon = statusIcon(task);
      const desc = task.description.length > maxDesc
        ? task.description.slice(0, maxDesc - 1) + '…'
        : task.description.padEnd(maxDesc);
      const dur = fmtDuration(task.durationMs).padStart(6);
      const line = `  ${icon} ${chalk.dim(dur)}  ${task.status === 'active' ? desc : chalk.dim(desc)}`;
      lines.push(line);
    }
  }

  return sectionTitleDouble('Tasks', cols) + '\n' + lines.join('\n') + '\n' + sectionBottomDouble(cols);
}
