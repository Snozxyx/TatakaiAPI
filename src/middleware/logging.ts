import type { MiddlewareHandler } from "hono";
import { log } from "../config/logger.js";

export const logging: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  log.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms });
};
