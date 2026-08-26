import { Hono } from "hono";
import { jsonOk } from "../../lib/envelope.js";
import { getSupabase } from "../../lib/supabase.js";
import { requireAdminSecret } from "../../middleware/auth.js";

const adminCountries = new Hono();
adminCountries.use("*", requireAdminSecret);

adminCountries.get("/", async (c) => {
  const sb = getSupabase();
  if (!sb) return c.json(jsonOk([]));
  const { data } = await sb.from("country_torrent_policies").select("*").order("iso_code");
  return c.json(jsonOk(data ?? []));
});

adminCountries.patch("/:isoCode", async (c) => {
  const iso = c.req.param("isoCode").toUpperCase().slice(0, 2);
  const patch = (await c.req.json()) as Record<string, unknown>;
  const sb = getSupabase();
  if (!sb) return c.json({ success: false, data: null, error: "Supabase not configured" }, 503);
  const allowed = [
    "torrent_policy",
    "enforcement_level",
    "downloading_illegal",
    "uploading_illegal",
    "streaming_illegal",
    "notes",
    "specific_law",
    "law_reference_url",
  ];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (k in patch) update[k] = patch[k];
  }
  const { data, error } = await sb.from("country_torrent_policies").update(update).eq("iso_code", iso).select().single();
  if (error) return c.json({ success: false, data: null, error: error.message }, 400);
  await sb.from("country_policy_audit_log").insert({
    iso_code: iso,
    field_name: "bulk",
    new_value: JSON.stringify(update),
    reason: (patch.reason as string) ?? null,
  });
  return c.json(jsonOk(data));
});

export { adminCountries as adminCountriesRouter };
