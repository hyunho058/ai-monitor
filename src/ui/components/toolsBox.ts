import chalk from 'chalk';
import { State } from '../../types/state.js';

function fmtDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function renderToolsBox(state: State): string {
  const toolEntries = Object.entries(state.toolCounts).sort((a, b) => b[1] - a[1]);
  const lines: string[] = [];

  // Tools Count Section
  lines.push(chalk.bold.cyan('Tools Usage'));
  if (toolEntries.length === 0) {
    lines.push(chalk.dim('  (no tool calls yet)'));
  } else {
    for (const [name, count] of toolEntries) {
      lines.push(`  ${name.padEnd(20)} ${chalk.yellow(count)} calls`);
    }
  }

  lines.push(''); // Spacer

  // Recent Tools Section
  lines.push(chalk.bold.cyan('Recent Tool Calls'));
  if (state.recentTools.length === 0) {
    lines.push(chalk.dim('  (none yet)'));
  } else {
    for (const tool of state.recentTools) {
      const statusIcon = tool.status === 'success'
        ? chalk.green('✓')
        : tool.status === 'failure'
          ? chalk.red('✗')
          : chalk.yellow('…');
      
      const namePart = tool.name.padEnd(20);
      const durPart = fmtDuration(tool.durationMs).padStart(8);
      lines.push(`  ${statusIcon} ${namePart} ${chalk.dim(durPart)}`);
    }
  }

  return lines.join('\n');
}
