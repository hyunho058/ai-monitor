import Table from 'cli-table3';
import chalk from 'chalk';
import { State } from '../../types/state.js';

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

  return chalk.bold.cyan('Tools') + '\n' + table.toString();
}
