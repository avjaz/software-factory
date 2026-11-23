import picomatch from 'picomatch';

import type { Pack } from '../packs/pack-loader.js';
import type { FactoryYaml } from '../target/factory-yaml.js';

const coreSealed: readonly string[] = ['.factory.yaml', '**/.gitignore'];

export function sealedGlobs(
  pack: Pick<Pack, 'sealed'>,
  factoryYaml: Pick<FactoryYaml, 'sealed'>,
): readonly string[] {
  return [...coreSealed, ...pack.sealed, ...(factoryYaml.sealed ?? [])];
}

export function sealedMatcher(globs: readonly string[]): (path: string) => boolean {
  const matches = picomatch([...globs], { dot: true });
  return (path) => matches(path);
}
