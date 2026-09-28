/**
 * Y-axis ticks on a 1/2/5 step, so every tick label is exact at the chosen
 * number of decimals. Letting the chart library pick its own steps (0.35,
 * 0.75, ...) made rounded labels read as unevenly spaced.
 */
export function returnAxis(values: readonly number[], targetTicks = 5) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const raw = (max - min) / Math.max(1, targetTicks - 1) || 0.1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 5, 10].find((factor) => factor * magnitude >= raw - 1e-12)! *
    magnitude;
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const round = (value: number) => Number(value.toFixed(digits + 2));
  const first = Math.floor(min / step + 1e-9);
  // Flat data (e.g. two identical valuations) still gets a two-tick axis.
  const last = Math.max(first + 1, Math.ceil(max / step - 1e-9));
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(round(i * step));
  return {
    ticks,
    domain: [ticks[0]!, ticks.at(-1)!] as [number, number],
    digits,
  };
}
