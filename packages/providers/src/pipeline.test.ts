import { describe, expect, it } from "vitest";
import { detectMissingIntervals } from "./gaps";
import { MemoryIngestionRepository } from "./memory-repository";
import { IngestionPipeline } from "./pipeline";
import type {
  HistoricalDataProvider,
  PhaseOneIndicator,
  ProviderObservation,
} from "./types";
import { freshnessQuality, validateObservation } from "./validation";
import { DATA_CONTRACTS } from "./contracts";

const observedAt = new Date("2026-08-22T10:00:00Z");
const btc = (value = 100_000, at = observedAt): ProviderObservation => ({
  indicator: "BTC_USD",
  observedAt: at,
  value,
  unit: "usd",
  providerReference: `btc:${at.toISOString()}`,
  payload: { value },
});
class FixtureProvider implements HistoricalDataProvider {
  readonly name = "coingecko";
  readonly role = "CANONICAL" as const;
  readonly supportedIndicators = ["BTC_USD"] as const;
  readonly supportsBackfill = true;
  readonly expectedLatency = "fixture";
  readonly rateLimit = "none";
  constructor(private values: ProviderObservation[] = [btc()]) {}
  async fetchLatest() {
    return this.values;
  }
  async fetchRange(_indicator: PhaseOneIndicator, from: Date, to: Date) {
    return this.values.filter(
      (v) => v.observedAt >= from && v.observedAt <= to,
    );
  }
}

describe("semantic and structural validation", () => {
  it("rejects a missing value", () =>
    expect(
      validateObservation(
        { ...btc(), value: undefined },
        DATA_CONTRACTS.BTC_USD,
      ).quality,
    ).toBe("REJECTED"));
  it("rejects an invalid unit", () =>
    expect(
      validateObservation({ ...btc(), unit: "eur" }, DATA_CONTRACTS.BTC_USD)
        .quality,
    ).toBe("REJECTED"));
  it("quarantines an extreme value", () =>
    expect(
      validateObservation(btc(9_999_999), DATA_CONTRACTS.BTC_USD).quality,
    ).toBe("QUARANTINED"));
  it("quarantines an implausible jump", () =>
    expect(
      validateObservation(btc(150_000), DATA_CONTRACTS.BTC_USD, btc(100_000))
        .quality,
    ).toBe("QUARANTINED"));
  it("detects stale observations per indicator", () =>
    expect(
      freshnessQuality(
        observedAt,
        new Date("2026-08-22T10:31:00Z"),
        DATA_CONTRACTS.BTC_USD,
      ),
    ).toBe("STALE"));
  it("quarantines an impossible stablecoin supply", () => {
    const candidate = {
      ...btc(),
      indicator: "STABLECOIN_SUPPLY_USD" as const,
      value: 100,
      unit: "usd",
    };
    expect(
      validateObservation(candidate, DATA_CONTRACTS.STABLECOIN_SUPPLY_USD)
        .quality,
    ).toBe("QUARANTINED");
  });
});

describe("idempotent pipeline", () => {
  it("persists raw and canonical observations exactly once", async () => {
    const repository = new MemoryIngestionRepository();
    const pipeline = new IngestionPipeline(
      repository,
      () => new Date("2026-08-22T10:01:00Z"),
    );
    const provider = new FixtureProvider();
    expect(
      (await pipeline.fetchAndIngest(provider, "BTC_USD")).canonicalInserted,
    ).toBe(1);
    expect(
      (await pipeline.fetchAndIngest(provider, "BTC_USD")).duplicates,
    ).toBe(1);
    expect(repository.raw).toHaveLength(1);
    expect(repository.canonical).toHaveLength(1);
  });
  it("resolves obsolete validation incidents after a clean observation", async () => {
    const repository = new MemoryIngestionRepository();
    const pipeline = new IngestionPipeline(repository);
    await pipeline.fetchAndIngest(new FixtureProvider(), "BTC_USD");
    expect(repository.resolvedEvents).toEqual(
      expect.arrayContaining([
        {
          indicator: "BTC_USD",
          type: "STRUCTURAL_ERROR",
          provider: "coingecko",
        },
        {
          indicator: "BTC_USD",
          type: "SEMANTIC_ANOMALY",
          provider: "coingecko",
        },
      ]),
    );
  });
  it("retains quarantined raw data but excludes it from canonical history", async () => {
    const repository = new MemoryIngestionRepository();
    const pipeline = new IngestionPipeline(repository);
    await pipeline.ingest(new FixtureProvider([btc(9_999_999)]), "BTC_USD", [
      btc(9_999_999),
    ]);
    expect(repository.raw[0]?.quality).toBe("QUARANTINED");
    expect(repository.canonical).toHaveLength(0);
    expect(repository.events[0]?.type).toBe("SEMANTIC_ANOMALY");
  });
  it("records a failed provider without manufacturing data", async () => {
    const repository = new MemoryIngestionRepository();
    const pipeline = new IngestionPipeline(repository);
    const provider = new FixtureProvider();
    provider.fetchLatest = async () => {
      throw new Error("offline");
    };
    await expect(pipeline.fetchAndIngest(provider, "BTC_USD")).rejects.toThrow(
      "offline",
    );
    expect(repository.raw).toHaveLength(0);
    expect(repository.events[0]?.type).toBe("PROVIDER_FAILURE");
    expect(repository.runs[0]).toMatchObject({
      status: "FAILED",
      jobType: "LATEST",
      error: "offline",
    });
  });
  it("distinguishes storage failure from provider failure", async () => {
    const repository = new MemoryIngestionRepository();
    const pipeline = new IngestionPipeline(repository);
    repository.insertRaw = async () => {
      throw new Error("database offline");
    };
    await expect(
      pipeline.fetchAndIngest(new FixtureProvider(), "BTC_USD"),
    ).rejects.toThrow("database offline");
    expect(repository.events[0]?.type).toBe("INGESTION_FAILURE");
  });
});

describe("reconciliation and recovery", () => {
  it("retains fallback data without silently promoting it to canonical", async () => {
    const repository = new MemoryIngestionRepository();
    const pipeline = new IngestionPipeline(repository);
    const fallback = new FixtureProvider();
    Object.defineProperty(fallback, "name", { value: "twelve-data" });
    const result = await pipeline.ingest(fallback, "BTC_USD", [btc()]);
    expect(result.valid).toBe(1);
    expect(result.canonicalInserted).toBe(0);
    expect(repository.raw).toHaveLength(1);
  });
  it("surfaces a cross-provider discrepancy", async () => {
    const repository = new MemoryIngestionRepository();
    const pipeline = new IngestionPipeline(repository);
    const fallback = new FixtureProvider([btc(90_000)]);
    Object.defineProperty(fallback, "name", { value: "twelve-data" });
    await pipeline.ingest(fallback, "BTC_USD", [btc(90_000)]);
    await pipeline.ingest(new FixtureProvider(), "BTC_USD", [btc()]);
    expect(repository.canonical[0]?.reconciliation.status).toBe("DISCREPANCY");
    expect(
      repository.events.some((e) => e.type === "PROVIDER_DISCREPANCY"),
    ).toBe(true);
  });
  it("finds missing expected periods", () => {
    const from = new Date("2026-08-22T10:00:00Z");
    const to = new Date("2026-08-22T10:30:00Z");
    expect(
      detectMissingIntervals(from, to, 900, [
        { observedAt: from },
        { observedAt: to },
      ]),
    ).toHaveLength(1);
  });
  it("can exclude provider calendar closures from gaps", () => {
    const saturday = new Date("2026-08-22T00:00:00Z");
    const monday = new Date("2026-08-24T00:00:00Z");
    expect(
      detectMissingIntervals(
        saturday,
        monday,
        86_400,
        [],
        (date) => ![0, 6].includes(date.getUTCDay()),
      ),
    ).toHaveLength(1);
  });
  it("treats stablecoin supply as a seven-day series", () => {
    const saturday = new Date("2026-08-22T00:00:00Z");
    const sunday = new Date("2026-08-23T00:00:00Z");
    expect(
      detectMissingIntervals(
        saturday,
        sunday,
        DATA_CONTRACTS.STABLECOIN_SUPPLY_USD.expectedIntervalSeconds,
        [],
      ),
    ).toHaveLength(2);
  });
  it("backfills after simulated downtime without duplicate canonical rows", async () => {
    const values = [
      btc(100_000, new Date("2026-08-22T10:00:00Z")),
      btc(101_000, new Date("2026-08-22T10:15:00Z")),
      btc(102_000, new Date("2026-08-22T10:30:00Z")),
    ];
    const repository = new MemoryIngestionRepository();
    const pipeline = new IngestionPipeline(repository);
    const provider = new FixtureProvider(values);
    await pipeline.ingest(provider, "BTC_USD", [values[0]!, values[2]!]);
    const recovery = await pipeline.recover(
      provider,
      "BTC_USD",
      values[0]!.observedAt,
      values[2]!.observedAt,
    );
    expect(recovery.missing).toBe(1);
    expect(repository.canonical).toHaveLength(3);
  });
  it("validates historical backfill against the preceding observation, not a future latest row", async () => {
    const repository = new MemoryIngestionRepository();
    const pipeline = new IngestionPipeline(repository);
    const provider = new FixtureProvider();
    await pipeline.ingest(provider, "BTC_USD", [
      btc(100_000, new Date("2026-08-22T10:00:00Z")),
    ]);
    const result = await pipeline.ingest(provider, "BTC_USD", [
      btc(50_000, new Date("2025-08-22T10:00:00Z")),
      btc(51_000, new Date("2025-08-23T10:00:00Z")),
    ]);
    expect(result.quarantined).toBe(0);
    expect(result.canonicalInserted).toBe(2);
  });
});
