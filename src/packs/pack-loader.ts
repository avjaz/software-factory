import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { PackError } from './pack-error.js';
import { parseManifest } from './pack-manifest.js';

export interface SkeletonParam {
  readonly name: string;
  readonly describe: string;
  readonly pattern: string;
  readonly pathSeparator?: string | undefined;
}

export interface PackSkeleton {
  readonly dir: string;
  readonly params: readonly SkeletonParam[];
}

export interface Pack {
  readonly name: string;
  readonly dir: string;
  readonly sealed: readonly string[];
  readonly network: readonly string[];
  readonly skills: readonly string[];
  readonly skeleton?: PackSkeleton;
}

export interface PackLoader {
  readonly load: (name: string) => Pack;
}

const packName = /^[a-z0-9][a-z0-9-]*$/;
const requiredFiles = ['manifest.yaml', 'Makefile', 'CLAUDE.factory.md'] as const;

export function loadPack(packsRoot: string, name: string): Pack {
  const dir = join(packsRoot, name);
  if (!packName.test(name) || !isDirectory(dir)) {
    throw new PackError(`unknown pack: ${name}`);
  }
  const missing = requiredFiles.find((file) => !isFile(join(dir, file)));
  if (missing !== undefined) {
    throw new PackError(`pack ${name}: missing ${missing}`);
  }
  const { skeleton, ...manifest } = parseManifest(
    readFileSync(join(dir, 'manifest.yaml'), 'utf8'),
    name,
  );
  const skeletonDir = join(dir, 'skeleton');
  const pack = { ...manifest, dir, skills: listSkills(join(dir, 'skills')) };
  if (!isDirectory(skeletonDir)) {
    if (skeleton !== undefined) {
      throw new PackError(`pack ${name}: skeleton: no skeleton folder`);
    }
    return pack;
  }
  return { ...pack, skeleton: { dir: skeletonDir, params: skeleton?.params ?? [] } };
}

function listSkills(skillsDir: string): readonly string[] {
  if (!existsSync(skillsDir)) {
    return [];
  }
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}
