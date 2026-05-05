import chalk from 'chalk';
import { State } from '../types/state.js';
import { renderHeader } from './components/header.js';
import { renderAgentsBox } from './components/agentsBox.js';
import { renderSkillsBox } from './components/skillsBox.js';
import { renderTasksBox } from './components/tasksBox.js';
import { renderFileActivityBox } from './components/fileActivityBox.js';
import { renderToolsBox } from './components/toolsBox.js';

let previousBodyLines = 0;

export function render(state: State, cols: number, rows: number, scrollOffset: number): number {
  if (state.connectionStatus === 'waiting') {
    process.stdout.write('\x1b[0f\x1b[2J');
    process.stdout.write(chalk.yellow('Waiting for session.jsonl...') + '\n' + chalk.dim('(searching ~/.claude/projects/)') + '\n');
    return scrollOffset;
  }

  const header = renderHeader(state, cols);
  const headerHeight = header.split('\n').length;

  const questionBanner = state.pendingQuestion
    ? chalk.bgYellow.black.bold(' ? WAITING FOR INPUT ') + ' ' + chalk.yellow(state.pendingQuestion)
    : null;

  const bodyParts: string[] = [
    ...(questionBanner ? [questionBanner] : []),
    renderTasksBox(state, cols),
    renderAgentsBox(state, cols),
    renderSkillsBox(state, cols),
    renderToolsBox(state, cols),
    renderFileActivityBox(state, cols),
  ];

  const hintLine = state.connectionStatus === 'frozen'
    ? chalk.yellow('  ❄  Stream frozen — last snapshot preserved. Press q to quit.')
    : chalk.dim('  Press q to quit · j/k to scroll · r to refresh');

  // Degrade: terminal too small for a split layout
  if (headerHeight >= rows) {
    const allLines = [header, ...bodyParts, hintLine].join('\n').split('\n');
    const totalLines = allLines.length;

    let adjustedOffset = scrollOffset;
    if (scrollOffset > 0 && totalLines > previousBodyLines) {
      adjustedOffset += (totalLines - previousBodyLines);
    }
    previousBodyLines = totalLines;

    const maxScroll = Math.max(0, totalLines - (rows - 1));
    adjustedOffset = Math.min(adjustedOffset, maxScroll);

    const visibleLines = allLines.slice(adjustedOffset, adjustedOffset + rows);
    process.stdout.write('\x1b[0f\x1b[2J');
    process.stdout.write(visibleLines.join('\n'));
    return adjustedOffset;
  }

  // Normal mode: header fixed, body scrollable, hint pinned at bottom
  const bodyRows = rows - headerHeight - 1; // 1 row reserved for hint line
  const bodyAllLines = bodyParts.join('\n').split('\n');
  const totalBodyLines = bodyAllLines.length;

  // Scroll stability: keep relative position when new lines are added
  let adjustedOffset = scrollOffset;
  if (scrollOffset > 0 && totalBodyLines > previousBodyLines) {
    adjustedOffset += (totalBodyLines - previousBodyLines);
  }
  previousBodyLines = totalBodyLines;

  const maxScroll = Math.max(0, totalBodyLines - bodyRows);
  adjustedOffset = Math.min(adjustedOffset, maxScroll);

  const visibleBody = bodyAllLines.slice(adjustedOffset, adjustedOffset + bodyRows);

  // Full clear, then write header at row 1, body at row headerHeight+1, hint at last row
  process.stdout.write('\x1b[0f\x1b[2J');
  process.stdout.write(`\x1b[1;1H${header}`);
  process.stdout.write(`\x1b[${headerHeight + 1};1H${visibleBody.join('\n')}`);
  process.stdout.write(`\x1b[${rows};1H${hintLine}`);

  return adjustedOffset;
}
