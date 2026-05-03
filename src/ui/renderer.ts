import chalk from 'chalk';
import { State } from '../types/state.js';
import { renderHeader } from './components/header.js';
import { renderAgentsBox } from './components/agentsBox.js';
import { renderSkillsBox } from './components/skillsBox.js';
import { renderTasksBox } from './components/tasksBox.js';
import { renderFileActivityBox } from './components/fileActivityBox.js';
import { renderToolsBox } from './components/toolsBox.js';

let previousTotalLines = 0;

export function render(state: State, cols: number, rows: number, scrollOffset: number): number {
  if (state.connectionStatus === 'waiting') {
    process.stdout.write('\x1b[0f\x1b[2J');
    process.stdout.write(chalk.yellow('Waiting for session.jsonl...') + '\n' + chalk.dim('(searching ~/.claude/projects/)') + '\n');
    return scrollOffset;
  }

  // Layout order: Header → [Question banner] → Tasks → Subagents → Skills → Tools → File Activity
  const questionBanner = state.pendingQuestion
    ? chalk.bgYellow.black.bold(' ? WAITING FOR INPUT ') + ' ' + chalk.yellow(state.pendingQuestion)
    : null;

  const parts: string[] = [
    renderHeader(state, cols),
    ...(questionBanner ? [questionBanner] : []),
    renderTasksBox(state, cols),
    renderAgentsBox(state, cols),
    renderSkillsBox(state, cols),
    renderToolsBox(state),
    renderFileActivityBox(state, cols),
  ];

  if (state.connectionStatus === 'frozen') {
    parts.push(chalk.yellow('\n  ❄  Stream frozen — last snapshot preserved. Press q to quit.'));
  } else {
    parts.push(chalk.dim('\n  Press q to quit · j/k to scroll · r to refresh'));
  }

  const fullContent = parts.join('\n');
  const allLines = fullContent.split('\n');
  const totalLines = allLines.length;

  // Task 4: Scroll Stability (Freeze View)
  let adjustedOffset = scrollOffset;
  if (scrollOffset > 0 && totalLines > previousTotalLines) {
    adjustedOffset += (totalLines - previousTotalLines);
  }
  previousTotalLines = totalLines;

  // Clamping
  const maxScroll = Math.max(0, totalLines - (rows - 1));
  adjustedOffset = Math.min(adjustedOffset, maxScroll);

  // Task 2: Viewport Windowing
  const visibleLines = allLines.slice(adjustedOffset, adjustedOffset + rows);
  
  // ANSI Clear Screen and Reset Cursor
  process.stdout.write('\x1b[0f\x1b[2J');
  process.stdout.write(visibleLines.join('\n'));

  return adjustedOffset;
}
