/** Enough decimals that evenly spaced axis ticks never read as uneven. */
export function axisDigits(values: readonly number[]) {
  if (!values.length) return 1;
  const span = Math.max(...values) - Math.min(...values);
  return span < 1 ? 2 : span < 10 ? 1 : 0;
}
