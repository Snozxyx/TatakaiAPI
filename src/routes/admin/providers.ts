import { Hono } from "hono";
import { jsonOk } from "../../lib/envelope.js";
import { requireAdminSecret } from "../../middleware/auth.js";
import { listProviderHealth, setProviderDisabled } from "../../services/providerHealth.js";

const adminProviders = new Hono();
adminProviders.use("*", requireAdminSecret);

adminProviders.get("/health", async (c) => {
  const rows = await listProviderHealth();
  return c.json(jsonOk(rows));
});

adminProviders.post("/:id/disable", async (c) => {
  await setProviderDisabled(c.req.param("id"), true);
  return c.json(jsonOk({ disabled: true }));
});

export { adminProviders as adminProvidersRouter };
