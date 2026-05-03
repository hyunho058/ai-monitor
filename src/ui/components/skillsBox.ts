import chalk from 'chalk';
import { State } from '../../types/state.js';

function fmtTime(epochMs: number): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function normalizeName(name: string): string {
  const stripped = name.startsWith('/') ? name.slice(1) : name;
  if (!stripped) return '(skill)';
  return '/' + stripped;
}

export function renderSkillsBox(state: State, cols: number): string {
  const nameWidth = Math.max(10, cols - 16);
  const skills = state.recentSkills || [];

  const lines: string[] = [];

  if (skills.length === 0) {
    lines.push(chalk.dim('  (no high-level skills yet)'));
  } else {
    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const icon = i === 0 ? chalk.green('✓') + ' ' : '  ';
      const rawName = normalizeName(skill.name);
      const displayName = rawName.length > nameWidth
        ? rawName.slice(0, nameWidth - 1) + '…'
        : rawName;
      const time = chalk.dim(`at ${fmtTime(skill.startTime)}`);
      lines.push(`  ${icon}${displayName} ${time}`);
    }
  }

  // Add a small spacer
  lines.push('');

  // Aggregated activity
  const activityLabels: Record<string, string> = {
    'Bash': 'bash',
    'Edit': 'edit',
    'Write': 'write',
    'Read': 'read',
    'Grep': 'grep',
  };

  const activityParts: string[] = [];
  for (const [tool, label] of Object.entries(activityLabels)) {
    const count = state.toolCounts[tool] ?? 0;
    if (count > 0) {
      activityParts.push(`${label}:${chalk.yellow(count)}`);
    }
  }

  if (activityParts.length > 0) {
    lines.push(chalk.dim('  Activity: ') + activityParts.join('  '));
  }

  return chalk.bold.cyan('Skill') + '\n' + lines.join('\n');
}
