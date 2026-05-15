import { describe, it, expect } from 'vitest';
import { GeminiLogTailer } from '../geminiLogTailer.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function dispatch(tailer: GeminiLogTailer, record: object): void {
  (tailer as any).dispatchRecord(record);
}

const T0 = '2024-01-01T00:00:00.000Z';

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GeminiLogTailer', () => {

  describe('recentSkills', () => {

    it('adds the base command to recentSkills when displayContent starts with a slash', () => {
      // given
      const tailer = new GeminiLogTailer('/fake/path');

      // when
      dispatch(tailer, { type: 'user', timestamp: T0, displayContent: '/compact some args' });

      // then
      expect(tailer.getState().recentSkills[0].name).toBe('/compact');
    });

    it('does not add an entry to recentSkills when the user message is not a slash command', () => {
      // given
      const tailer = new GeminiLogTailer('/fake/path');

      // when
      dispatch(tailer, { type: 'user', timestamp: T0, displayContent: 'just a regular message' });

      // then
      expect(tailer.getState().recentSkills).toHaveLength(0);
    });

  });

  describe('tokens', () => {

    it('parses all token fields from the tokens object and reflects them in state', () => {
      // given
      const tailer = new GeminiLogTailer('/fake/path');

      // when
      dispatch(tailer, {
        type: 'gemini',
        timestamp: T0,
        tokens: { input: 500, output: 100, cached: 200, thoughts: 50, total: 600 },
      });

      // then
      const s = tailer.getState();
      expect(s.inputTokens).toBe(500);
      expect(s.outputTokens).toBe(100);
      expect(s.cacheReadTokens).toBe(200);
      expect(s.thoughtTokens).toBe(50);
      expect(s.totalTokens).toBe(600);
      expect(s.contextUsed).toBe(700); // input + cached
    });

  });

  describe('model', () => {

    it('extracts the model name from the gemini record and reflects it in state', () => {
      // given
      const tailer = new GeminiLogTailer('/fake/path');

      // when
      dispatch(tailer, { type: 'gemini', timestamp: T0, model: 'gemini-2.0-flash', tokens: {} });

      // then
      expect(tailer.getState().model).toBe('gemini-2.0-flash');
    });

  });

  describe('toolCounts', () => {

    it('aggregates toolCounts per tool name across all toolCalls in a gemini record', () => {
      // given
      const tailer = new GeminiLogTailer('/fake/path');

      // when
      dispatch(tailer, {
        type: 'gemini',
        timestamp: T0,
        tokens: {},
        toolCalls: [
          { id: '1', name: 'read_file',  status: 'success' },
          { id: '2', name: 'read_file',  status: 'success' },
          { id: '3', name: 'write_file', status: 'success' },
        ],
      });

      // then
      expect(tailer.getState().toolCounts['read_file']).toBe(2);
      expect(tailer.getState().toolCounts['write_file']).toBe(1);
    });

  });

});
