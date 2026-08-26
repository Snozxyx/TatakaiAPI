import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./config/env.js";
import { log } from "./config/logger.js";
import { corsMiddleware } from "./config/cors.js";
import { onError, notFound } from "./config/errorHandler.js";
import { logging } from "./middleware/logging.js";
import { cacheControl } from "./middleware/cacheControl.js";
import { optionalCatalogAuth } from "./middleware/auth.js";
import { contentRouter } from "./routes/content.js";
import { playbackRouter } from "./routes/playback.js";
import { extensionsRouter } from "./routes/extensions.js";
import { countriesRouter } from "./routes/countries.js";
import { providersRouter } from "./routes/providers.js";
import { mangaRouter } from "./routes/manga.js";
import { mappingRouter } from "./routes/mapping.js";
import { proxyRouter } from "./routes/proxy.js";
import { relayRouter } from "./routes/relay.js";
import { syncRouter } from "./routes/sync.js";
import { adminCountriesRouter } from "./routes/admin/countries.js";
import { adminProvidersRouter } from "./routes/admin/providers.js";
import { adminExtensionsRouter } from "./routes/admin/extensions.js";
import { adminMappingsRouter } from "./routes/admin/mappings.js";
import { tokoRouter } from "./routes/toko.js";

const app = new Hono();

app.use(logging);
app.use(corsMiddleware);
app.use(cacheControl);

app.get("/health", (c) => c.text("ok", 200));

const v3 = new Hono();
v3.use("*", optionalCatalogAuth);

v3.route("/content", contentRouter);
v3.route("/manga", mangaRouter);
v3.route("/mapping", mappingRouter);
v3.route("/playback", playbackRouter);
v3.route("/relay", relayRouter);
v3.route("/extensions", extensionsRouter);
v3.route("/countries", countriesRouter);
v3.route("/providers", providersRouter);
v3.route("/sync", syncRouter);
v3.route("/admin/countries", adminCountriesRouter);
v3.route("/admin/providers", adminProvidersRouter);
v3.route("/admin/extensions", adminExtensionsRouter);
v3.route("/admin/mappings", adminMappingsRouter);
v3.route("/toko", tokoRouter);

app.route("/api/v3", v3);
app.route("/api/proxy", proxyRouter);

app.notFound(notFound);
app.onError(onError);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port }, "TatakaiV5 listening");
});

export default app;
