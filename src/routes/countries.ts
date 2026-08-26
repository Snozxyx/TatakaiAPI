import { Hono } from "hono";
import { jsonOk } from "../lib/envelope.js";
import { getSupabase } from "../lib/supabase.js";

const countries = new Hono();

countries.get("/:isoCode", async (c) => {
  const iso = c.req.param("isoCode").toUpperCase().slice(0, 2);
  const sb = getSupabase();
  if (!sb) {
    return c.json(jsonOk({ iso_code: iso, torrent_policy: "unclear", vpn_recommended: false }));
  }
  const { data } = await sb
    .from("country_torrent_policies")
    .select("iso_code, torrent_policy, vpn_recommended")
    .eq("iso_code", iso)
    .maybeSingle();
  if (!data) return c.json({ success: false, data: null, error: "Not found" }, 404);
  return c.json(jsonOk(data, { cache: "miss", ttlSec: 3600, source: "db" }));
});

export { countries as countriesRouter };
