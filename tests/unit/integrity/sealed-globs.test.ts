import { describe, expect, it } from 'vitest';

import { sealedGlobs, sealedMatcher } from '../../../src/integrity/sealed-globs.js';

describe('sealedMatcher', () => {
  const isSealed = sealedMatcher(
    sealedGlobs(
      { sealed: ['acceptance/**', 'Makefile', '.claude/**'] },
      { sealed: ['src/test/java/**/ArchitectureTest.java'] },
    ),
  );

  it.each([
    'acceptance/hello.sh',
    'acceptance/deep/nested/x.ts',
    'acceptance/.hidden',
    'Makefile',
    '.claude/skills/s/SKILL.md',
    'src/test/java/nz/co/ArchitectureTest.java',
    '.factory.yaml',
    '.gitignore',
    'src/.gitignore',
    'acceptance/.gitignore',
  ])('Can_say_sealed_when_the_path_is_%s', (path) => {
    // When
    const actual = isSealed(path);

    // Then
    expect(actual).toBe(true);
  });

  it.each([
    'src/greet.txt',
    'makefile',
    'sub/Makefile',
    'acceptancex/hello.sh',
    'src/test/java/nz/co/OtherTest.java',
    'sub/.factory.yaml',
    '.gitignore.bak',
  ])('Can_say_not_sealed_when_the_path_is_%s', (path) => {
    // When
    const actual = isSealed(path);

    // Then
    expect(actual).toBe(false);
  });

  it('Can_list_the_core_globs_then_the_pack_globs_then_the_factory_yaml_globs', () => {
    // When
    const actual = sealedGlobs({ sealed: ['acceptance/**'] }, { sealed: ['extra/**'] });

    // Then
    expect(actual).toEqual(['.factory.yaml', '**/.gitignore', 'acceptance/**', 'extra/**']);
  });

  it('Can_seal_only_the_core_paths_when_neither_pack_nor_factory_yaml_add_globs', () => {
    // Given
    const coreOnly = sealedMatcher(sealedGlobs({ sealed: [] }, {}));

    // When
    const actual = ['.factory.yaml', 'a/.gitignore', 'Makefile'].map(coreOnly);

    // Then
    expect(actual).toEqual([true, true, false]);
  });
});
