import { describe, it, expect } from 'vitest';
import { LogTailer } from '../logTailer.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function parse(tailer: LogTailer, event: object): void {
  (tailer as any).parseLine(JSON.stringify(event));
}

const T0   = '2024-01-01T00:00:00.000Z';
const T4s  = '2024-01-01T00:00:04.000Z';
const T15s = '2024-01-01T00:00:15.000Z';

function assistantToolUse(id: string, name: string, input: object = {}, ts = T0) {
  return {
    type: 'assistant',
    timestamp: ts,
    message: { content: [{ type: 'tool_use', id, name, input }] },
  };
}

function userToolResult(toolUseId: string, isError = false, ts = T4s) {
  return {
    type: 'user',
    timestamp: ts,
    message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError }] },
  };
}

function userString(content: string, ts = T0) {
  return { type: 'user', timestamp: ts, message: { content } };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('LogTailer', () => {

  describe('recentSkills', () => {

    it('stores skill name without leading slash when a slash command is invoked', () => {
      // given
      const tailer = new LogTailer();

      // when
      parse(tailer, userString('<command-name>/harness-ops:specify</command-name>'));

      // then
      expect(tailer.getState().recentSkills[0].name).toBe('harness-ops:specify');
    });

    it('deduplicates to one entry when the same skill arrives via both paths within 10s', () => {
      // given
      const tailer = new LogTailer();

      // when - Path 1: user message XML tag
      parse(tailer, userString('<command-name>/harness-ops:specify</command-name>', T0));
      // when - Path 2: Skill tool result (4s later)
      parse(tailer, assistantToolUse('sk-1', 'Skill', { skill: 'harness-ops:specify' }, T0));
      parse(tailer, userToolResult('sk-1', false, T4s));

      // then
      expect(tailer.getState().recentSkills).toHaveLength(1);
      expect(tailer.getState().recentSkills[0].name).toBe('harness-ops:specify');
    });

    it('keeps both entries when Path 2 arrives more than 10s after Path 1', () => {
      // given
      const tailer = new LogTailer();

      // when
      parse(tailer, userString('<command-name>/harness-ops:specify</command-name>', T0));
      parse(tailer, assistantToolUse('sk-1', 'Skill', { skill: 'harness-ops:specify' }, T0));
      parse(tailer, userToolResult('sk-1', false, T15s));

      // then
      expect(tailer.getState().recentSkills).toHaveLength(2);
    });

    it('adds a built-in command to recentSkills even when no Skill tool is invoked', () => {
      // given
      const tailer = new LogTailer();

      // when
      parse(tailer, userString('<command-name>/compact</command-name>'));

      // then
      expect(tailer.getState().recentSkills[0].name).toBe('compact');
    });

    it('sets exited to true when the /exit command is received', () => {
      // given
      const tailer = new LogTailer();

      // when
      parse(tailer, userString('<command-name>/exit</command-name>'));

      // then
      expect(tailer.getState().exited).toBe(true);
    });

  });

  describe('tool use / result', () => {

    it('increments toolCounts when a tool_use event is received', () => {
      // given
      const tailer = new LogTailer();

      // when
      parse(tailer, assistantToolUse('id-1', 'Bash'));

      // then
      expect(tailer.getState().toolCounts['Bash']).toBe(1);
    });

    it('records a success entry with duration in recentTools when tool_result succeeds', () => {
      // given
      const tailer = new LogTailer();
      parse(tailer, assistantToolUse('id-1', 'Bash', {}, T0));

      // when
      parse(tailer, userToolResult('id-1', false, T4s));

      // then
      const tool = tailer.getState().recentTools[0];
      expect(tool.name).toBe('Bash');
      expect(tool.status).toBe('success');
      expect(tool.durationMs).toBe(4000);
    });

    it('records a failure entry in recentTools when tool_result has is_error=true', () => {
      // given
      const tailer = new LogTailer();
      parse(tailer, assistantToolUse('id-1', 'Bash'));

      // when
      parse(tailer, userToolResult('id-1', true));

      // then
      expect(tailer.getState().recentTools[0].status).toBe('failure');
    });

    it('sets pendingQuestion when AskUserQuestion tool_use is received', () => {
      // given
      const tailer = new LogTailer();

      // when
      parse(tailer, assistantToolUse('id-1', 'AskUserQuestion', { question: 'Which option?' }));

      // then
      expect(tailer.getState().pendingQuestion).toBe('Which option?');
    });

    it('clears pendingQuestion to null when AskUserQuestion tool_result is received', () => {
      // given
      const tailer = new LogTailer();
      parse(tailer, assistantToolUse('id-1', 'AskUserQuestion', { question: 'Which option?' }));

      // when
      parse(tailer, userToolResult('id-1'));

      // then
      expect(tailer.getState().pendingQuestion).toBeNull();
    });

  });

  describe('Agent', () => {

    it('adds an incomplete agent with subagent type to activeAgents when Agent tool_use is received', () => {
      // given
      const tailer = new LogTailer();

      // when
      parse(tailer, assistantToolUse('ag-1', 'Agent', { subagent_type: 'Explore', description: 'Find files' }));

      // then
      const agents = tailer.getState().activeAgents;
      expect(agents).toHaveLength(1);
      expect(agents[0].subagentType).toBe('Explore');
      expect(agents[0].completed).toBe(false);
    });

  });

  describe('fileActivities', () => {

    it('records a read operation with file path and success status when a Read tool completes', () => {
      // given
      const tailer = new LogTailer();
      parse(tailer, assistantToolUse('id-1', 'Read', { file_path: '/src/index.ts' }, T0));

      // when
      parse(tailer, userToolResult('id-1', false, T4s));

      // then
      const fa = tailer.getState().fileActivities[0];
      expect(fa.operation).toBe('read');
      expect(fa.path).toBe('/src/index.ts');
      expect(fa.status).toBe('success');
    });

  });

  describe('tokens', () => {

    it('parses token counts from the usage field and reflects them in state', () => {
      // given
      const tailer = new LogTailer();

      // when
      parse(tailer, {
        type: 'assistant',
        timestamp: T0,
        message: {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 200,
            cache_creation_input_tokens: 10,
          },
        },
      });

      // then
      const s = tailer.getState();
      expect(s.inputTokens).toBe(100);
      expect(s.outputTokens).toBe(50);
      expect(s.cacheReadTokens).toBe(200);
      expect(s.contextUsed).toBe(310); // input + cache_read + cache_creation
    });

  });

  describe('model', () => {

    it('extracts the model name from message.model and reflects it in state', () => {
      // given
      const tailer = new LogTailer();

      // when
      parse(tailer, { type: 'assistant', timestamp: T0, message: { model: 'claude-sonnet-4-6' } });

      // then
      expect(tailer.getState().model).toBe('claude-sonnet-4-6');
    });

  });

  describe('parseErrors', () => {

    it('increments parseErrors when an invalid JSON line is received', () => {
      // given
      const tailer = new LogTailer();

      // when
      (tailer as any).parseLine('not valid json {{{');

      // then
      expect(tailer.getState().parseErrors).toBe(1);
    });

  });

});
