import { getSupabase } from "../lib/supabase.js";

export async function listProviderHealth() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("provider_health_states").select("*").order("provider_id");
  return data ?? [];
}

export async function setProviderDisabled(providerId: string, disabled: boolean) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb
    .from("provider_health_states")
    .update({ disabled, updated_at: new Date().toISOString() })
    .eq("provider_id", providerId);
  if (error) throw error;
}
