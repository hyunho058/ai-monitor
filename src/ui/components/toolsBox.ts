import chalk from 'chalk';
import { State } from '../../types/state.js';
import { sectionTitle, sectionTitleDouble, sectionBottomDouble } from './utils.js';

function fmtDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function renderToolsBox(state: State, cols: number): string {
  const toolEntries = Object.entries(state.toolCounts).sort((a, b) => b[1] - a[1]);
  const lines: string[] = [];

  lines.push(sectionTitleDouble('Tools Usage', cols));
  const inlineParts = toolEntries.map(([name, count]) => `${name.toLowerCase()}:${chalk.cyan(count)}`);
  const inlineStr = inlineParts.length > 0 ? inlineParts.join('  ') : chalk.dim('(no tool calls yet)');
  lines.push('  ' + inlineStr);

  lines.push(sectionTitle('Recent Tool Calls', cols));
  if (state.recentTools.length === 0) {
    lines.push(chalk.dim('  (none yet)'));
  } else {
    for (const tool of state.recentTools.slice(0, 5)) {
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

  lines.push(sectionBottomDouble(cols));
  return lines.join('\n');
}
