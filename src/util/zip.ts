export function zip<A, B>(left: readonly A[], right: readonly B[]): readonly (readonly [A, B])[] {
  const rights = right[Symbol.iterator]();
  const pairs = left.map((value): readonly [A, B] => {
    const next = rights.next();
    if (next.done === true) {
      throw new Error(`cannot zip ${String(left.length)} values with ${String(right.length)}`);
    }
    return [value, next.value];
  });
  if (rights.next().done !== true) {
    throw new Error(`cannot zip ${String(left.length)} values with ${String(right.length)}`);
  }
  return pairs;
}
