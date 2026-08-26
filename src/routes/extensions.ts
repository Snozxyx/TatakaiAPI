import { Hono } from "hono";
import { jsonOk } from "../lib/envelope.js";
import { getManifestById, insertManifestDraft, auditLog, listApprovedManifests } from "../services/extensionRegistry.js";
import type { ExtensionManifestRow } from "../services/extensionRegistry.js";

const ext = new Hono();

ext.get("/manifests", async (c) => {
  const rows = await listApprovedManifests();
  const data = rows.map((m) => ({
    id: m.extension_id,
    name: m.name,
    version: m.version,
    type: m.type,
    main: m.main_url,
    update: m.update_url,
    description: m.description,
    speed: m.speed,
    accuracy: m.accuracy,
    regions: m.regions,
    nsfw: m.nsfw,
    permissions: m.permissions,
    signature: m.signature,
    signedBy: m.signed_by,
  }));
  return c.json(jsonOk(data, { cache: "miss", ttlSec: 300, source: "db" }));
});

ext.get("/manifests/:id", async (c) => {
  const row = await getManifestById(c.req.param("id"));
  if (!row || row.submission_status !== "approved" || row.is_killed) {
    return c.json({ success: false, data: null, error: "Not found" }, 404);
  }
  return c.json(
    jsonOk(
      {
        id: row.extension_id,
        name: row.name,
        version: row.version,
        type: row.type,
        main: row.main_url,
        update: row.update_url,
        description: row.description,
        permissions: row.permissions,
        signature: row.signature,
        signedBy: row.signed_by,
      },
      { cache: "miss", ttlSec: 300, source: "db" },
    ),
  );
});

// POST /api/v3/extensions/submit — public submission endpoint (no admin secret required)
ext.post("/submit", async (c) => {
  const body = (await c.req.json()) as ExtensionManifestRow;

  if (!body.extension_id || !body.name || !body.version || !body.type) {
    return c.json({ success: false, data: null, error: "Missing required fields: extension_id, name, version, type" }, 400);
  }

  await insertManifestDraft({
    extension_id: body.extension_id,
    name: body.name,
    version: body.version,
    type: body.type,
    main_url: body.main_url ?? "",
    update_url: body.update_url,
    description: body.description,
    permissions: body.permissions ?? [],
    signature: body.signature,
    signed_by: body.signed_by,
    submission_status: "pending",
  });

  await auditLog(body.extension_id, "public_submit", body, null);

  return c.json(
    jsonOk({
      extension_id: body.extension_id,
      submission_status: "pending",
    }),
  );
});

// GET /api/v3/extensions/:id/status — poll review status for a submitted extension
ext.get("/:id/status", async (c) => {
  const id = c.req.param("id");
  const row = await getManifestById(id);

  if (!row) {
    return c.json({ success: false, data: null, error: "Not found" }, 404);
  }

  const rowAny = row as ExtensionManifestRow & { notes?: string | null; updated_at?: string | null };

  return c.json(
    jsonOk({
      submission_status: row.submission_status,
      main_url: row.main_url,
      notes: rowAny.notes ?? null,
      updated_at: rowAny.updated_at ?? null,
    }),
  );
});

// GET /api/v3/extensions/:id — fetch full extension detail by ID
ext.get("/:id", async (c) => {
  const row = await getManifestById(c.req.param("id"));
  if (!row || row.is_killed) {
    return c.json({ success: false, error: "extension_not_found" }, 404);
  }
  return c.json(
    jsonOk({
      id: row.extension_id,
      name: row.name ?? null,
      type: row.type ?? null,
      version: row.version ?? null,
      categories: (row as any).categories ?? [],
      description: row.description ?? null,
      permissions: row.permissions ?? [],
      icon: (row as any).icon ?? null,
      banner: (row as any).banner ?? null,
      screenshots: (row as any).screenshots ?? [],
      versionHistory: (row as any).version_history ?? [],
    }),
  );
});

export { ext as extensionsRouter };
