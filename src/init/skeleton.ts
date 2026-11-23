import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import type { Pack, SkeletonParam } from '../packs/pack-loader.js';
import { RefusalError } from '../refusal.js';

export interface SkeletonFile {
  readonly target: string;
  readonly text: string;
  readonly mode: number;
}

interface Binding {
  readonly token: string;
  readonly text: string;
  readonly path: string;
}

export function planSkeleton(
  repo: string,
  pack: Pack,
  values: ReadonlyMap<string, string>,
): readonly SkeletonFile[] {
  const { skeleton } = pack;
  if (skeleton === undefined) {
    throw new RefusalError(`pack ${pack.name} has no skeleton`);
  }
  const bindings = bind(skeleton.params, values);
  const files = sourceFiles(skeleton.dir).map((source) => ({
    target: substitute(posix(relative(skeleton.dir, source)), bindings, (b) => b.path),
    text: substitute(readFileSync(source, 'utf8'), bindings, (b) => b.text),
    mode: statSync(source).mode & 0o777,
  }));
  const clash = files.find((file) => existsSync(join(repo, file.target)));
  if (clash !== undefined) {
    throw new RefusalError(`skeleton file exists: ${clash.target}`);
  }
  return files;
}

export function writeSkeleton(repo: string, files: readonly SkeletonFile[]): void {
  for (const file of files) {
    const path = join(repo, file.target);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.text);
    chmodSync(path, file.mode);
  }
}

function bind(
  params: readonly SkeletonParam[],
  values: ReadonlyMap<string, string>,
): readonly Binding[] {
  const declared = new Set(params.map((param) => param.name));
  const unknown = [...values.keys()].find((name) => !declared.has(name));
  if (unknown !== undefined) {
    throw new RefusalError(`unknown param: ${unknown}`);
  }
  return params.map((param) => {
    const value = values.get(param.name);
    if (value === undefined) {
      throw new RefusalError(`--param ${param.name} is required: ${param.describe}`);
    }
    if (!new RegExp(param.pattern).test(value)) {
      throw new RefusalError(
        `--param ${param.name}: ${JSON.stringify(value)} does not match ${param.pattern}`,
      );
    }
    const path =
      param.pathSeparator === undefined ? value : value.split(param.pathSeparator).join('/');
    return { token: `{{${param.name}}}`, text: value, path };
  });
}

function substitute(
  text: string,
  bindings: readonly Binding[],
  pick: (binding: Binding) => string,
): string {
  return bindings.reduce(
    (result, binding) => result.replaceAll(binding.token, pick(binding)),
    text,
  );
}

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort((a, b) => (posix(relative(dir, a)) < posix(relative(dir, b)) ? -1 : 1));
}

function posix(path: string): string {
  return path.split(sep).join('/');
}
