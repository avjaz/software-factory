export function tail(text: string, lines: number): string {
  const all = text.split(/\r?\n/);
  if (all.at(-1) === '') {
    all.pop();
  }
  return all.slice(-lines).join('\n');
}
