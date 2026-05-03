import * as readline from 'readline';
import { LogTailer } from './parser/logTailer.js';
import { findLatestSession } from './parser/autoDetect.js';
import { render } from './ui/renderer.js';

const RENDER_INTERVAL_MS = 2000;

function getCols(): number {
  return process.stdout.columns ?? 120;
}

function getRows(): number {
  return process.stdout.rows ?? 40;
}

let scrollOffset = 0;

function shutdown(tailer: LogTailer, interval: ReturnType<typeof setInterval>): void {
  clearInterval(interval);
  tailer.stop();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  readline.emitKeypressEvents(process.stdin);
  // Exit alternate buffer and show cursor
  process.stdout.write('\x1b[?1049l\x1b[?25h');
  process.exit(0);
}

function main(): void {
  const argPath = process.argv[2];
  const autoDetect = !argPath;

  const tailer = new LogTailer(argPath);
  tailer.start();

  let cols = getCols();
  let rows = getRows();

  // Enter alternate buffer and hide cursor
  process.stdout.write('\x1b[?1049h\x1b[?25l');

  // Initial render
  scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);

  const interval = setInterval(() => {
    // Auto-detect: re-evaluate latest session file
    if (autoDetect) {
      const latest = findLatestSession();
      if (latest && latest !== tailer.getCurrentFile()) {
        tailer.switchFile(latest);
      }
    }

    cols = getCols();
    rows = getRows();
    scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);
  }, RENDER_INTERVAL_MS);

  // Handle SIGWINCH — update cols/rows on next render cycle (D8)
  process.on('SIGWINCH', () => {
    cols = getCols();
    rows = getRows();
  });

  // Keyboard interaction (D14)
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on('keypress', (_, key) => {
      if (!key) return;

      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        shutdown(tailer, interval);
      }

      if (key.name === 'r') {
        cols = getCols();
        rows = getRows();
        scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);
      }

      // Scrolling handlers
      if (key.name === 'j' || key.name === 'down') {
        scrollOffset++;
        scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);
      }
      if (key.name === 'k' || key.name === 'up') {
        if (scrollOffset > 0) {
          scrollOffset--;
          scrollOffset = render(tailer.getState(), cols, rows, scrollOffset);
        }
      }
    });
  }

  process.on('SIGINT', () => shutdown(tailer, interval));
  process.on('SIGTERM', () => shutdown(tailer, interval));
}

main();
