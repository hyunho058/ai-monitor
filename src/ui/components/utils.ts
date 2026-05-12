import chalk from 'chalk';

export function sectionTitle(label: string, cols: number): string {
  const usedWidth = 3 + label.length + 1;
  const trailing = Math.max(0, cols - usedWidth);
  return chalk.gray('── ') + chalk.bold.gray(label) + chalk.gray(' ' + '─'.repeat(trailing));
}

export function sectionTitleDouble(label: string, cols: number): string {
  // ╔═ Label ═...═╗  (total visible width = cols)
  // inner: cols - 2 chars between the corners
  const inner = cols - 2;
  const labelPart = `═ ${label} `;
  const fillLen = Math.max(0, inner - labelPart.length - 1); // -1 for right ═ before ╗
  const fill = '═'.repeat(fillLen);
  return '\n' + chalk.gray('╔') + chalk.bold.gray(labelPart) + chalk.gray(fill + '═╗');
}

export function sectionBottomDouble(cols: number): string {
  const fill = '═'.repeat(Math.max(0, cols - 2));
  return chalk.gray('╚' + fill + '╝');
}
