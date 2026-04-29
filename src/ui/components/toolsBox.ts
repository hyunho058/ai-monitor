import Table from 'cli-table3';
import chalk from 'chalk';
import { State } from '../../types/state.js';

function fmtDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function renderToolsBox(state: State): string {
  const entries = Object.entries(state.toolCounts).sort((a, b) => b[1] - a[1]);

  const table = new Table({
    head: [chalk.cyan('Tool'), chalk.cyan('Calls')],
    style: { head: [], border: [] },
    colWidths: [30, 8],
    colAligns: ['left', 'right'],
  });

  if (entries.length === 0) {
    table.push([{ colSpan: 2, content: chalk.dim('(no tool calls yet)') }]);
  } else {
    for (const [name, count] of entries) {
      table.push([name, String(count)]);
    }
  }

  const recentTable = new Table({
    head: [chalk.cyan('Recent'), chalk.cyan('Status'), chalk.cyan('Duration')],
    style: { head: [], border: [] },
    colWidths: [24, 10, 10],
    colAligns: ['left', 'left', 'right'],
  });

  if (state.recentTools.length === 0) {
    recentTable.push([{ colSpan: 3, content: chalk.dim('(none yet)') }]);
  } else {
    for (const tool of state.recentTools) {
      const statusIcon = tool.status === 'success'
        ? chalk.green('✓')
        : tool.status === 'failure'
          ? chalk.red('✗')
          : chalk.yellow('…');
      recentTable.push([tool.name, statusIcon, fmtDuration(tool.durationMs)]);
    }
  }

  return (
    chalk.bold.cyan('Tools') + '\n' + table.toString() + '\n' +
    chalk.bold.cyan('Recent Tool Calls') + '\n' + recentTable.toString()
  );
}
