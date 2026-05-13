import chalk from 'chalk';
import { State, ActiveAgent } from '../../types/state.js';
import { sectionTitleDouble, sectionBottomDouble } from './utils.js';

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
  lines.push(sectionTitleDouble('Active Agents', cols));

  if (state.activeAgents.length === 0) {
    lines.push(chalk.dim('  (no active agents)'));
  } else {
    const roots = buildTree(state.activeAgents);
    const flattened = flattenTree(roots);

    const rawTypes = flattened.map(f => f.agent.subagentType ?? 'agent');
    const maxTypeLen = rawTypes.reduce((m, t) => Math.max(m, t.length), 0);
    const typeColWidth = Math.min(maxTypeLen, 20);

    for (const { agent, depth, isLast } of flattened) {
      let prefix = '  ';
      if (depth > 0) {
        prefix += '  '.repeat(depth - 1) + (isLast ? '└─ ' : '├─ ');
      }

      const icon = agent.completed ? chalk.dim('◯') : chalk.green('●');

      const rawType = agent.subagentType ?? 'agent';
      const typeStr = rawType.length > 20
        ? rawType.slice(0, 19) + '…'
        : rawType.padEnd(typeColWidth);

      const rawDesc = agent.description ?? agent.task ?? '(agent)';
      const elapsedStr = fmtElapsed(agent.elapsedMs);
      const reservedWidth = prefix.length + 2 + typeColWidth + 2 + elapsedStr.length + 2;
      const descWidth = Math.max(10, cols - reservedWidth);
      const descStr = rawDesc.length > descWidth
        ? rawDesc.slice(0, descWidth - 1) + '…'
        : rawDesc;

      lines.push(`${prefix}${icon} ${typeStr}  ${descStr.padEnd(descWidth)}  ${chalk.yellow(elapsedStr)}`);
    }
  }

  return lines.join('\n') + '\n' + sectionBottomDouble(cols);
}
