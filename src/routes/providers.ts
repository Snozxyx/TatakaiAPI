import { Hono } from "hono";
import { jsonOk } from "../lib/envelope.js";
import { listProviderHealth } from "../services/providerHealth.js";

const providers = new Hono();

providers.get("/health", async (c) => {
  const health = await listProviderHealth();
  return c.json(jsonOk(health, { cache: "miss", ttlSec: 60, source: "db" }));
});

export { providers as providersRouter };
