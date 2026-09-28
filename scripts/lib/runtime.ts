import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Shared plumbing for operational scripts. */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** The daily cycle pins one calculation time for every stage. */
export function calculationTime(): Date {
  return new Date(process.env.CYCLE_CALCULATION_AT ?? Date.now());
}

const PAGE_SIZE = 1_000;

/**
 * Reads every row of a query. PostgREST caps responses (1,000 rows by
 * default), so an unpaginated query silently truncates long histories.
 */
export async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Every auth user; the admin API returns at most one page per call. */
export async function listAllUsers(client: SupabaseClient) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}
