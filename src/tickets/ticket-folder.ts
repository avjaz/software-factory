export interface TicketFolder {
  readonly name: string;
  readonly number: string;
  readonly id: string;
}

const folderName = /^(\d{2})-(.+)$/;

export function parseFolderName(name: string): TicketFolder | undefined {
  const match = folderName.exec(name);
  if (match === null) {
    return undefined;
  }
  const [, number = '', id = ''] = match;
  return { name, number, id };
}
