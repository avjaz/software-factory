export interface Output {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}
