import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
export { SupabaseIngestionRepository } from "./ingestion-repository";

export function createBrowserDatabaseClient(url: string, anonKey: string): SupabaseClient {
  return createBrowserClient(url, anonKey);
}
