import { createClient } from "@supabase/supabase-js";
import {
  evaluateRegimes,
  type EngineIndicator,
  type EngineObservation,
} from "../packages/signal-engine/src";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
};
const client = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const data: Array<{
  observed_at: string;
  value: number;
  quality_status: EngineObservation["quality"];
  indicators: unknown;
}> = [];
for (let from = 0; ; from += 1_000) {
  const { data: page, error } = await client
    .from("canonical_observations")
    .select("observed_at,value,quality_status,indicators!inner(code)")
    .order("observed_at", { ascending: true })
    .range(from, from + 999);
  if (error) throw error;
  data.push(...(page as typeof data));
  if (!page || page.length < 1_000) break;
}
const observations: Partial<Record<EngineIndicator, EngineObservation[]>> = {};
for (const row of data) {
  const indicator = (row.indicators as { code: EngineIndicator }).code;
  const item: EngineObservation = {
    indicator,
    observedAt: new Date(row.observed_at),
    value: Number(row.value),
    quality: row.quality_status,
  };
  (observations[indicator] ??= []).push(item);
}
const output = evaluateRegimes({ asOf: new Date(), observations });
console.log(JSON.stringify(output, null, 2));
