import * as readline from 'readline';
import { LogTailer } from './parser/logTailer.js';
import { findLatestSession } from './parser/autoDetect.js';
import { render } from './ui/renderer.js';

const RENDER_INTERVAL_MS = 2000;

function getCols(): number {
  return process.stdout.columns ?? 120;
}

function shutdown(tailer: LogTailer, interval: ReturnType<typeof setInterval>): void {
  clearInterval(interval);
  tailer.stop();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  readline.emitKeypressEvents(process.stdin);
  process.stdout.write('\n');
  process.exit(0);
}

function main(): void {
  const argPath = process.argv[2];
  const autoDetect = !argPath;

  const tailer = new LogTailer(argPath);
  tailer.start();

  let cols = getCols();

  // Initial render
  render(tailer.getState(), cols);

  const interval = setInterval(() => {
    // Auto-detect: re-evaluate latest session file
    if (autoDetect) {
      const latest = findLatestSession();
      if (latest && latest !== tailer.getCurrentFile()) {
        tailer.switchFile(latest);
      }
    }

    cols = getCols();
    render(tailer.getState(), cols);
  }, RENDER_INTERVAL_MS);

  // Handle SIGWINCH — update cols on next render cycle (D8)
  process.on('SIGWINCH', () => {
    cols = getCols();
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
        render(tailer.getState(), cols);
      }
    });
  }

  process.on('SIGINT', () => shutdown(tailer, interval));
  process.on('SIGTERM', () => shutdown(tailer, interval));
}

main();
