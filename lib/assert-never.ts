export function assertNever(value: never): never {
  void value;

  throw new Error("Unexpected discriminated union value.");
}
