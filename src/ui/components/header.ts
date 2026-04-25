import Table from 'cli-table3';
import chalk from 'chalk';
import { State } from '../../types/state.js';

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${String(m % 60).padStart(2, '0')}m`;
  if (m > 0) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function statusBadge(status: State['connectionStatus']): string {
  switch (status) {
    case 'connected':
      return chalk.green('● CONNECTED');
    case 'waiting':
      return chalk.yellow('○ WAITING');
    case 'frozen':
      return chalk.yellow('❄ FROZEN');
  }
}

export function renderHeader(state: State, cols: number): string {
  const sessionId = state.sessionId
    ? state.sessionId.slice(0, 12) + '…'
    : chalk.dim('—');
  const model = state.model || chalk.dim('—');
  const context = fmtNum(state.contextUsed);
  const uptime = fmtMs(state.uptimeMs);
  const idle = fmtMs(state.idleMs);
  const totalTok = fmtNum(state.totalTokens);
  const status = statusBadge(state.connectionStatus);
  const errors = state.parseErrors > 0
    ? chalk.red(`ERR: ${state.parseErrors}`)
    : chalk.dim('ERR: 0');

  const table = new Table({
    head: [
      chalk.cyan('Session'),
      chalk.cyan('Model'),
      chalk.cyan('Context'),
      chalk.cyan('Uptime'),
      chalk.cyan('Idle'),
      chalk.cyan('Tokens'),
      chalk.cyan('Status'),
      chalk.cyan('Errors'),
    ],
    style: { head: [], border: [] },
  });

  table.push([sessionId, model, context, uptime, idle, totalTok, status, errors]);

  // Truncate label for narrow terminals
  const label = cols < 80
    ? chalk.bold.cyan('ccmonitor-lite')
    : chalk.bold.cyan('╔═ ccmonitor-lite ═╗');

  return label + '\n' + table.toString();
}
