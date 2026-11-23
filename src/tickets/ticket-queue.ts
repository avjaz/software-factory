import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import type { PendingTicket, TestFile } from './ticket.js';
import { TicketError } from './ticket-error.js';
import { parseFolderName, type TicketFolder } from './ticket-folder.js';
import { parseTicket } from './ticket-parser.js';

const pendingPath = join('docs', 'tickets', 'pending');
const designPath = join('docs', 'design.md');
const ticketFile = 'ticket.md';

export function nextTicket(repo: string): PendingTicket | undefined {
  const [first] = pendingFolders(join(repo, pendingPath));
  return first === undefined ? undefined : loadPending(repo, first);
}

export function pendingTicket(repo: string, name: string): PendingTicket {
  const folder = pendingFolders(join(repo, pendingPath)).find((f) => f.name === name);
  if (folder === undefined) {
    throw new TicketError(`no such pending ticket: ${name}`);
  }
  return loadPending(repo, folder);
}

function loadPending(repo: string, folder: TicketFolder): PendingTicket {
  const dir = join(repo, pendingPath, folder.name);
  const ticketPath = join(dir, ticketFile);
  if (!(statSync(ticketPath, { throwIfNoEntry: false })?.isFile() ?? false)) {
    throw new TicketError(`invalid ticket ${folder.name}: missing ${ticketFile}`);
  }
  const text = readFileSync(ticketPath, 'utf8');
  const ticket = parseTicket(folder, text, readOptional(join(repo, designPath)));
  return { dir, ticket, testFiles: testFilesIn(dir) };
}

function pendingFolders(pending: string): readonly TicketFolder[] {
  if (!existsSync(pending)) {
    return [];
  }
  const names = readdirSync(pending, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const folders = names.map((name) => {
    const folder = parseFolderName(name);
    if (folder === undefined) {
      throw new TicketError(`ticket folder must be NN-<id>: ${name}`);
    }
    return folder;
  });
  rejectDuplicateNumbers(folders);
  return folders;
}

function rejectDuplicateNumbers(folders: readonly TicketFolder[]): void {
  const clash = folders.find((folder, index) => folders[index + 1]?.number === folder.number);
  if (clash !== undefined) {
    const names = folders.filter((folder) => folder.number === clash.number).map((f) => f.name);
    throw new TicketError(`duplicate ticket number ${clash.number}: ${names.join(', ')}`);
  }
}

function testFilesIn(dir: string): readonly TestFile[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((source) => source !== join(dir, ticketFile))
    .map((source) => ({ source, target: relative(dir, source).split(sep).join('/') }))
    .sort((a, b) => a.target.localeCompare(b.target));
}

function readOptional(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}
