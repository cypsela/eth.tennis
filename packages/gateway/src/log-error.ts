export function logErrorTree(label: string, err: unknown): void {
  console.error(label, err);
  const cause = (err as { cause?: unknown; }).cause;
  if (cause instanceof AggregateError) {
    cause.errors.forEach((inner, i) => {
      console.error(`${label} [rpc ${i}]`, inner);
    });
  }
}
