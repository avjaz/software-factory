import type { Ticket } from '../tickets/ticket.js';

const rules = [
  '- Make the acceptance tests listed below pass.',
  '- Work test-first: add or extend unit tests, then write the code. Run `make unit` as you go.',
  '- Run `make unit` as a Bash command on its own, never chained with other commands: it is the only build command you may run. Create and change files with Write and Edit, not with shell commands.',
  '- Never edit sealed paths: the ticket, the acceptance tests, the Makefile, `.factory.yaml`, any `.gitignore`, and every other path your rules name as sealed.',
  '- If a sealed test or the ticket itself is wrong, do not work around it: finish with `spec_defect` and say why.',
  '- Leave the ticket where it is: on green the factory moves it to `docs/tickets/done/` and commits.',
  '- When you finish, the factory runs `make verify` on the whole repo. If it fails, you get its output and another turn.',
].join('\n');

const finish = [
  'End your turn with the structured result:',
  '',
  '```json',
  '{ "status": "done" | "spec_defect", "summary": "…", "evidence": "…" }',
  '```',
  '',
  '- `done` means ready for verification, not finished: the factory decides with `make verify`.',
  '- `spec_defect` needs `evidence`: which test or ticket line is wrong, and why.',
].join('\n');

export function buildFirstPrompt(ticket: Ticket, testFiles: readonly string[]): string {
  const design =
    ticket.design.length === 0
      ? 'None named by this ticket.'
      : ticket.design.map((section) => section.text).join('\n\n');
  const tests =
    testFiles.length === 0
      ? 'None: the criteria are covered by existing tests.'
      : testFiles.map((path) => `- \`${path}\``).join('\n');
  return [
    `# Ticket ${ticket.folder}: ${ticket.title}`,
    `## Rules\n\n${rules}`,
    `## Ticket\n\n${ticket.body.trim()}`,
    `## Design sections\n\n${design}`,
    `## Acceptance tests added by this ticket\n\n${tests}`,
    `## How to finish\n\n${finish}`,
  ]
    .join('\n\n')
    .concat('\n');
}
