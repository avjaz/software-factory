export type ViolationKind =
  'modified' | 'added' | 'deleted' | 'makefile_mismatch' | 'test_mismatch';

export interface Violation {
  readonly path: string;
  readonly kind: ViolationKind;
}

export type IntegrityResult =
  { readonly ok: true } | { readonly ok: false; readonly violations: readonly Violation[] };
