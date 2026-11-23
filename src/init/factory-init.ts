import { copyFileSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { stringify } from 'yaml';

import type { Git } from '../git/git.js';
import type { Pack, PackLoader } from '../packs/pack-loader.js';
import { RefusalError } from '../refusal.js';
import { factoryYamlFile, readFactoryYaml } from '../target/factory-yaml.js';
import { withImportLine } from './claude-md.js';
import { planSkeleton, writeSkeleton } from './skeleton.js';

const copiedFiles = ['Makefile', 'CLAUDE.factory.md'] as const;

export class FactoryInit {
  constructor(
    private readonly git: Git,
    private readonly packs: PackLoader,
  ) {}

  run(repo: string, packName: string, skeleton?: ReadonlyMap<string, string>): void {
    if (!this.git.isTopLevel(repo)) {
      throw new RefusalError('not a git repo');
    }
    if (!this.git.isClean(repo)) {
      throw new RefusalError('working tree is dirty');
    }
    const pack = this.packs.load(packName);
    const existing = readFactoryYaml(repo);
    if (existing !== undefined && existing.pack !== pack.name) {
      throw new RefusalError(`${factoryYamlFile} names pack ${existing.pack}, not ${pack.name}`);
    }
    const files = skeleton === undefined ? [] : planSkeleton(repo, pack, skeleton);
    copyPack(pack, repo);
    writeSkeleton(repo, files);
    if (existing === undefined) {
      writeFileSync(join(repo, factoryYamlFile), stringify({ pack: pack.name }));
    }
    writeClaudeMd(repo);
  }
}

function copyPack(pack: Pack, repo: string): void {
  for (const file of copiedFiles) {
    copyFileSync(join(pack.dir, file), join(repo, file));
  }
  for (const skill of pack.skills) {
    const target = join(repo, '.claude', 'skills', skill);
    rmSync(target, { recursive: true, force: true });
    cpSync(join(pack.dir, 'skills', skill), target, { recursive: true });
  }
}

function writeClaudeMd(repo: string): void {
  const path = join(repo, 'CLAUDE.md');
  const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  const next = withImportLine(current);
  if (next !== current) {
    writeFileSync(path, next);
  }
}
