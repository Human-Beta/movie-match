export type Pair<T> = readonly [T, T];

export function isPair<T>(values: readonly T[]): values is Pair<T> {
  return values.length === 2;
}
