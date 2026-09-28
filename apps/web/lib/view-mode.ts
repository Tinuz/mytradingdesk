import "server-only";
import { cookies } from "next/headers";

export const VIEW_MODE_COOKIE = "cmi-view-mode";
export type ViewMode = "guided" | "advanced";

/**
 * The view mode is a cookie so the server renders the right sections
 * directly; setting it after hydration made advanced content flash.
 */
export async function viewMode(): Promise<ViewMode> {
  return (await cookies()).get(VIEW_MODE_COOKIE)?.value === "ADVANCED"
    ? "advanced"
    : "guided";
}
