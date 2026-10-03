import { cache } from "react";
import { cookies } from "next/headers";
import { loadSlot } from "@/lib/persist";

export const SLOT_COOKIE = "tenpercent_slot";

export { parseState } from "@/lib/parse-state";
export { listSlots } from "@/lib/persist";

export function slotCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 400 };
}

export const readSlot = cache(async () => {
  const jar = await cookies();
  const id = jar.get(SLOT_COOKIE)?.value;
  if (!id) return null;
  return loadSlot(id);
});
