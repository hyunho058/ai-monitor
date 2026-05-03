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
  const lines: string[] = [];
  lines.push(chalk.bold.cyan('Subagents'));

  if (state.activeAgents.length === 0) {
    lines.push(chalk.dim('  (no active agents)'));
  } else {
    const roots = buildTree(state.activeAgents);
    const flattened = flattenTree(roots);

    for (const { agent, depth, isLast } of flattened) {
      let prefix = '  ';
      if (depth > 0) {
        prefix += '  '.repeat(depth - 1) + (isLast ? '└─ ' : '├─ ');
      }

      const elapsed = fmtElapsed(agent.elapsedMs);
      const rawName = agent.task || '(agent)';

      const reservedWidth = prefix.length + 10;
      const nameWidth = Math.max(10, cols - reservedWidth);
      const truncated = rawName.length > nameWidth ? rawName.slice(0, nameWidth - 1) + '…' : rawName;

      let nameStr = truncated;
      if (agent.completed) {
        nameStr = chalk.dim(nameStr);
      } else {
        nameStr = chalk.green(nameStr);
      }

      lines.push(`${prefix}${nameStr} ${chalk.yellow(elapsed.padStart(8))}`);
    }
  }

  return lines.join('\n');
}
