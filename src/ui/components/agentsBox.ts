import Table from 'cli-table3';
import chalk from 'chalk';
import { State, ActiveAgent } from '../../types/state.js';

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

interface TreeNode {
  agent: ActiveAgent;
  children: TreeNode[];
}

function buildTree(agents: ActiveAgent[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const agent of agents) {
    map.set(agent.id, { agent, children: [] });
  }

  for (const agent of agents) {
    const node = map.get(agent.id)!;
    if (agent.parentId && map.has(agent.parentId)) {
      map.get(agent.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort by start time
  const sortFn = (a: TreeNode, b: TreeNode) => a.agent.startTime - b.agent.startTime;
  roots.sort(sortFn);
  for (const node of map.values()) {
    node.children.sort(sortFn);
  }

  return roots;
}

function flattenTree(nodes: TreeNode[], depth = 0): { agent: ActiveAgent; depth: number; isLast: boolean }[] {
  const result: { agent: ActiveAgent; depth: number; isLast: boolean }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const isLast = i === nodes.length - 1;
    result.push({ agent: nodes[i].agent, depth, isLast });
    result.push(...flattenTree(nodes[i].children, depth + 1));
  }
  return result;
}

export function renderAgentsBox(state: State, cols: number): string {
  const taskWidth = Math.max(20, cols - 42);

  const table = new Table({
    head: [chalk.cyan('Agent'), chalk.cyan('Elapsed')],
    style: { head: [], border: [] },
    colWidths: [taskWidth + 16, 10],
  });

  if (state.activeAgents.length === 0) {
    table.push([{ colSpan: 2, content: chalk.dim('(no active agents)') }]);
  } else {
    const roots = buildTree(state.activeAgents);
    const flattened = flattenTree(roots).slice(0, 5);

    for (const { agent, depth, isLast } of flattened) {
      let prefix = '';
      if (depth > 0) {
        prefix = '  '.repeat(depth - 1) + (isLast ? '└─ ' : '├─ ');
      }

      const nameWidth = taskWidth + 14 - prefix.length;
      const rawName = agent.task || '(agent)';
      const truncated = rawName.length > nameWidth ? rawName.slice(0, nameWidth - 1) + '…' : rawName;
      const name = prefix + truncated;
      const elapsed = fmtElapsed(agent.elapsedMs);

      if (agent.completed) {
        table.push([chalk.dim(name), chalk.dim(elapsed)]);
      } else {
        table.push([chalk.green(name), chalk.yellow(elapsed)]);
      }
    }
  }

  return chalk.bold.cyan('Subagents') + '\n' + table.toString();
}
