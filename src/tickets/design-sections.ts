export interface MarkdownSection {
  readonly heading: string;
  readonly body: string;
}

interface Heading {
  readonly index: number;
  readonly line: string;
  readonly level: number;
  readonly text: string;
}

const headingLine = /^ {0,3}(#{1,6})[ \t]+(.*)$/;
const fenceLine = /^ {0,3}(`{3,}|~{3,})/;

export function findNumberedSection(markdown: string, number: string): MarkdownSection | undefined {
  return findSection(markdown, (text) => firstWord(text).replace(/\.$/, '') === number);
}

export function findHeadingSection(markdown: string, title: string): MarkdownSection | undefined {
  return findSection(markdown, (text) => text.trim() === title);
}

function findSection(
  markdown: string,
  matches: (text: string) => boolean,
): MarkdownSection | undefined {
  const lines = markdown.split(/\r?\n/);
  const headings = headingsOf(lines);
  const start = headings.find((heading) => matches(heading.text));
  if (start === undefined) {
    return undefined;
  }
  const end = headings.find((h) => h.index > start.index && h.level <= start.level);
  return {
    heading: start.line,
    body: lines.slice(start.index + 1, end?.index).join('\n'),
  };
}

function headingsOf(lines: readonly string[]): readonly Heading[] {
  const headings: Heading[] = [];
  let fence: string | undefined;
  lines.forEach((line, index) => {
    const marker = fenceLine.exec(line)?.[1];
    if (marker !== undefined) {
      fence = nextFence(fence, marker);
      return;
    }
    const match = fence === undefined ? headingLine.exec(line) : null;
    if (match !== null) {
      const [, hashes = '', text = ''] = match;
      headings.push({ index, line, level: hashes.length, text });
    }
  });
  return headings;
}

function nextFence(open: string | undefined, marker: string): string | undefined {
  if (open === undefined) {
    return marker;
  }
  const closes = marker.startsWith(open);
  return closes ? undefined : open;
}

function firstWord(text: string): string {
  const [word = ''] = text.trim().split(/\s+/);
  return word;
}
