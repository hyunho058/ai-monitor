import Table from 'cli-table3';
import chalk from 'chalk';
import { State } from '../../types/state.js';

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

export function renderAgentsBox(state: State, cols: number): string {
  const taskWidth = Math.max(20, cols - 42);

  const table = new Table({
    head: [chalk.cyan('Agent ID'), chalk.cyan('Task'), chalk.cyan('Elapsed')],
    style: { head: [], border: [] },
    colWidths: [16, taskWidth, 10],
  });

  if (state.activeAgents.length === 0) {
    table.push([{ colSpan: 3, content: chalk.dim('(no active agents)') }]);
  } else {
    for (const agent of state.activeAgents) {
      const shortId = agent.id.length > 14 ? agent.id.slice(-14) : agent.id;
      const task = agent.task || chalk.dim('—');
      const elapsed = fmtElapsed(agent.elapsedMs);
      table.push([shortId, task, elapsed]);
    }
  }

  return chalk.bold.cyan('Active Agents') + '\n' + table.toString();
}
