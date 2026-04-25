import logUpdate from 'log-update';
import chalk from 'chalk';
import { State } from '../types/state.js';
import { renderHeader } from './components/header.js';
import { renderToolsBox } from './components/toolsBox.js';
import { renderAgentsBox } from './components/agentsBox.js';

export function render(state: State, cols: number): void {
  if (state.connectionStatus === 'waiting') {
    logUpdate(chalk.yellow('Waiting for session.jsonl...') + '\n' + chalk.dim('(searching ~/.claude/projects/)'));
    return;
  }

  const parts: string[] = [
    renderHeader(state, cols),
    renderToolsBox(state),
    renderAgentsBox(state, cols),
  ];

  if (state.connectionStatus === 'frozen') {
    parts.push(chalk.yellow('  ❄  Stream frozen — last snapshot preserved. Press q to quit.'));
  } else {
    parts.push(chalk.dim('  Press q to quit · r to refresh'));
  }

  logUpdate(parts.join('\n'));
}
