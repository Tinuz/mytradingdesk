import type { CanonicalObservation } from "./types";

export interface MissingInterval {
  from: Date;
  to: Date;
}

export function detectMissingIntervals(
  from: Date,
  to: Date,
  expectedIntervalSeconds: number,
  observations: readonly Pick<CanonicalObservation, "observedAt">[],
  isExpected: (date: Date) => boolean = () => true,
  alignmentSeconds = 0,
): MissingInterval[] {
  const intervalMs = expectedIntervalSeconds * 1_000;
  const alignmentMs = alignmentSeconds * 1_000;
  const bucket = (timestamp: number) =>
    Math.floor((timestamp - alignmentMs) / intervalMs);
  const present = new Set(
    observations.map((item) => bucket(item.observedAt.getTime())),
  );
  const gaps: MissingInterval[] = [];
  for (
    let cursor =
      Math.ceil((from.getTime() - alignmentMs) / intervalMs) * intervalMs +
      alignmentMs;
    cursor <= to.getTime();
    cursor += intervalMs
  ) {
    const date = new Date(cursor);
    if (isExpected(date) && !present.has(bucket(cursor)))
      gaps.push({
        from: date,
        to: new Date(Math.min(cursor + intervalMs, to.getTime())),
      });
  }
  return gaps;
}
