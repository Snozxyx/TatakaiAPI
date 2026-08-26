import { Hono } from "hono";
import { jsonOk } from "../../lib/envelope.js";
import { requireAdminSecret } from "../../middleware/auth.js";
import * as ext from "../../services/extensionRegistry.js";

const adminExt = new Hono();
adminExt.use("*", requireAdminSecret);

adminExt.post("/submit", async (c) => {
  const body = (await c.req.json()) as ext.ExtensionManifestRow;
  await ext.insertManifestDraft({
    extension_id: body.extension_id,
    name: body.name,
    version: body.version,
    type: body.type,
    main_url: body.main_url,
    update_url: body.update_url,
    description: body.description,
    permissions: body.permissions ?? [],
    signature: body.signature,
    signed_by: body.signed_by,
    submission_status: "pending",
  });
  await ext.auditLog(body.extension_id, "submit", body, null);
  return c.json(jsonOk({ ok: true }));
});

adminExt.post("/:id/approve", async (c) => {
  const id = c.req.param("id");
  await ext.updateManifestStatus(id, "approved");
  await ext.auditLog(id, "approve", {}, null);
  return c.json(jsonOk({ ok: true }));
});

adminExt.post("/:id/reject", async (c) => {
  const id = c.req.param("id");
  await ext.updateManifestStatus(id, "rejected");
  await ext.auditLog(id, "reject", await c.req.json().catch(() => ({})), null);
  return c.json(jsonOk({ ok: true }));
});

adminExt.post("/:id/disable", async (c) => {
  const id = c.req.param("id");
  await ext.updateManifestStatus(id, "disabled", { kill: true, killReason: "admin_disable" });
  await ext.auditLog(id, "disable", {}, null);
  return c.json(jsonOk({ ok: true }));
});

export { adminExt as adminExtensionsRouter };
