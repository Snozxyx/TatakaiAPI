import { getSupabase } from "../lib/supabase.js";

export interface ExtensionManifestRow {
  extension_id: string;
  name: string;
  version: string;
  type: string;
  main_url: string;
  update_url?: string | null;
  description?: string | null;
  speed?: string | null;
  accuracy?: string | null;
  regions?: string[] | null;
  nsfw?: boolean;
  permissions?: string[];
  signature?: string | null;
  signed_by?: string | null;
  submission_status: string;
  is_killed?: boolean;
}

export async function listApprovedManifests(): Promise<ExtensionManifestRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("extension_manifests")
    .select("*")
    .eq("submission_status", "approved")
    .eq("is_killed", false);
  return (data ?? []) as ExtensionManifestRow[];
}

export async function getManifestById(id: string): Promise<ExtensionManifestRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("extension_manifests").select("*").eq("extension_id", id).maybeSingle();
  return data as ExtensionManifestRow | null;
}

export async function insertManifestDraft(row: Partial<ExtensionManifestRow> & { extension_id: string; name: string; version: string; type: string; main_url: string }) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("extension_manifests").upsert(
    {
      ...row,
      submission_status: row.submission_status ?? "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "extension_id" },
  );
  if (error) throw error;
}

export async function updateManifestStatus(
  extensionId: string,
  status: "approved" | "rejected" | "disabled" | "under_review",
  opts?: { kill?: boolean; killReason?: string },
) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const patch: Record<string, unknown> = {
    submission_status: status === "disabled" ? "disabled" : status,
    updated_at: new Date().toISOString(),
  };
  if (status === "approved") {
    patch.is_killed = false;
    patch.killed_at = null;
    patch.kill_reason = null;
  }
  if (opts?.kill) {
    patch.is_killed = true;
    patch.killed_at = new Date().toISOString();
    patch.kill_reason = opts.killReason ?? null;
  }
  const { error } = await sb.from("extension_manifests").update(patch).eq("extension_id", extensionId);
  if (error) throw error;
}

export async function auditLog(extensionId: string, eventType: string, details: unknown, performedBy?: string | null) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("extension_audit_logs").insert({
    extension_id: extensionId,
    event_type: eventType,
    performed_by: performedBy ?? null,
    details: details as object,
  });
}
