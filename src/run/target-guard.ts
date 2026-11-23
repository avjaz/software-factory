import type { Git } from '../git/git.js';
import type { Pack, PackLoader } from '../packs/pack-loader.js';
import { RefusalError } from '../refusal.js';
import { type FactoryYaml, factoryYamlFile, readFactoryYaml } from '../target/factory-yaml.js';

export interface Target {
  readonly settings: FactoryYaml;
  readonly pack: Pack;
}

export interface TargetCheck {
  readonly check: (repo: string) => Target;
}

export class TargetGuard implements TargetCheck {
  constructor(
    private readonly git: Git,
    private readonly packs: PackLoader,
  ) {}

  check(repo: string): Target {
    if (!this.git.isTopLevel(repo)) {
      throw new RefusalError('not a git repo');
    }
    const settings = readFactoryYaml(repo);
    if (settings === undefined) {
      throw new RefusalError(`no ${factoryYamlFile}`);
    }
    return { settings, pack: this.packs.load(settings.pack) };
  }
}
