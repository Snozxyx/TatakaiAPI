import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, hasSupabase } from "../config/env.js";
import { log } from "../config/logger.js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!hasSupabase) return null;
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    log.info("Supabase service client initialized");
  }
  return client;
}
