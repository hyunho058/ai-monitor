import chalk from 'chalk';
import { State } from '../../types/state.js';

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${String(m % 60).padStart(2, '00')}m`;
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
    case 'connected': return chalk.green('● CONNECTED');
    case 'waiting':   return chalk.yellow('○ WAITING');
    case 'frozen':    return chalk.yellow('❄ FROZEN');
  }
}

function wrapPills(items: string[], sep: string, cols: number): string {
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < items.length; i++) {
    const part = i === 0 ? items[i] : sep + items[i];
    const candidate = current + part;
    // Strip ANSI for rough length check
    const visibleLen = candidate.replace(/\x1b\[[0-9;]*m/g, '').length;
    if (current && visibleLen > cols) {
      lines.push(current);
      current = items[i];
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

export function renderHeader(state: State, cols: number): string {
  const sessionId = state.sessionId
    ? state.sessionId.slice(0, 12) + '…'
    : chalk.dim('—');
  const model   = state.model || chalk.dim('—');
  const context = fmtNum(state.contextUsed);
  const uptime  = fmtMs(state.uptimeMs);
  const idle    = fmtMs(state.idleMs);
  const status  = statusBadge(state.connectionStatus);
  const errors  = state.parseErrors > 0
    ? chalk.red(`ERR: ${state.parseErrors}`)
    : chalk.dim('ERR: 0');

  const inTok  = fmtNum(state.inputTokens);
  const outTok = fmtNum(state.outputTokens);
  const cacheR = fmtNum(state.cacheReadTokens);

  const topItems = [status, sessionId, model, `ctx ${context}`];
  const botItems = [
    `up ${uptime}`,
    `idle ${idle}`,
    chalk.cyan(`in ${inTok}`),
    chalk.green(`out ${outTok}`),
    chalk.dim(`$cache ${cacheR}`),
    errors,
  ];

  const sep1 = chalk.dim(' │ ');
  const sep2 = chalk.dim(' · ');

  const topLine = wrapPills(topItems, sep1, cols);
  const botLine = wrapPills(botItems, sep2, cols);

  const label = cols < 80
    ? chalk.bold.cyan('ccmonitor-lite')
    : chalk.bold.cyan('╔═ ccmonitor-lite ═╗');

  return label + '\n' + topLine + '\n' + botLine;
}
