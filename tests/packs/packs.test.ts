import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { planSkeleton, type SkeletonFile } from '../../src/init/skeleton.js';
import { loadPack } from '../../src/packs/pack-loader.js';

function textOf(files: readonly SkeletonFile[], target: string): string | undefined {
  return files.find((file) => file.target === target)?.text;
}

const packsRoot = join(import.meta.dirname, '..', '..', 'packs');
const packNames = readdirSync(packsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe('packs', () => {
  it('Can_find_no_language_word_when_reading_the_factory_core', () => {
    const srcDir = join(import.meta.dirname, '..', '..', 'src');
    const files = readdirSync(srcDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));

    // When
    const actual = files.filter((file) =>
      /\b(java|maven|mvn|spring|package)\b/i.test(readFileSync(file, 'utf8')),
    );

    // Then
    expect(files).not.toEqual([]);
    expect(actual).toEqual([]);
  });

  it('Can_find_at_least_one_pack_when_reading_the_packs_folder', () => {
    // Then
    expect(packNames).not.toEqual([]);
  });

  it.each(packNames)('Can_load_the_%s_pack_when_its_manifest_names_its_folder', (name) => {
    // When
    const actual = loadPack(packsRoot, name);

    // Then
    expect(actual.name).toBe(name);
    expect(actual.skills).not.toEqual([]);
  });

  it.each(packNames)(
    'Can_find_the_make_contract_targets_when_reading_the_%s_pack_makefile',
    (name) => {
      // When
      const targets = readFileSync(join(packsRoot, name, 'Makefile'), 'utf8')
        .split('\n')
        .flatMap((line) => /^([a-z-]+):/.exec(line)?.slice(1) ?? []);

      // Then
      expect(targets).toEqual(expect.arrayContaining(['unit', 'acceptance', 'verify']));
    },
  );

  it('Can_load_the_java_pack_with_the_sealed_paths_and_network_from_the_design', () => {
    // When
    const actual = loadPack(packsRoot, 'java');

    // Then
    expect(actual).toEqual({
      name: 'java',
      dir: join(packsRoot, 'java'),
      sealed: [
        'acceptance/**',
        'docs/tickets/**',
        'Makefile',
        'scripts/**',
        '.github/**',
        'pom.xml',
        '.factory.yaml',
        'CLAUDE.md',
        'CLAUDE.factory.md',
        '.claude/**',
        'mvnw',
        'mvnw.cmd',
        '.mvn/**',
      ],
      network: ['repo.maven.apache.org'],
      skills: ['java-standards'],
      skeleton: {
        dir: join(packsRoot, 'java', 'skeleton'),
        params: [
          expect.objectContaining({ name: 'package', pathSeparator: '.' }),
          expect.objectContaining({ name: 'name' }),
        ],
      },
    });
  });

  it('Can_plan_the_java_skeleton_with_package_folders_when_given_a_package_and_name', () => {
    const pack = loadPack(packsRoot, 'java');
    const values = new Map([
      ['package', 'nz.co.example.demo'],
      ['name', 'demo-app'],
    ]);

    // When
    const actual = planSkeleton(join(packsRoot, 'missing-repo'), pack, values);

    // Then
    const targets = actual.map((file) => file.target);
    expect(targets).toEqual(
      expect.arrayContaining([
        'pom.xml',
        'mvnw',
        'src/main/java/nz/co/example/demo/Main.java',
        'src/main/java/nz/co/example/demo/health/HealthController.java',
        'src/test/java/nz/co/example/demo/ArchitectureTest.java',
        'scripts/acceptance.sh',
        'acceptance/tests/health.sh',
        'src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker',
      ]),
    );
    expect(
      textOf(actual, 'src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker'),
    ).toBe('mock-maker-subclass\n');
    expect(textOf(actual, 'acceptance/tests/health.sh')).toContain(`"$BASE_URL/health" || true)`);
    expect(actual.filter((file) => file.text.includes('{{'))).toEqual([]);
    expect(actual.find((file) => file.target === 'mvnw')?.mode).toBe(0o755);
  });
});
