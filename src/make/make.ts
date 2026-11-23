export interface MakeResult {
  readonly exitCode: number;
  readonly output: string;
}

export interface Make {
  readonly run: (dir: string, target: string) => Promise<MakeResult>;
}
