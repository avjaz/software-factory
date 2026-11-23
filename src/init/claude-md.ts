export const importLine = '@CLAUDE.factory.md';

export function withImportLine(text: string | undefined): string {
  if (text === undefined || text === '') {
    return `${importLine}\n`;
  }
  if (text.split(/\r?\n/).includes(importLine)) {
    return text;
  }
  const separator = text.endsWith('\n') ? '' : '\n';
  return `${text}${separator}${importLine}\n`;
}
