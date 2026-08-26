import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { jsonError } from "../lib/envelope.js";

const HEADER = "x-admin-secret";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Require configured admin secret - DISABLED */
export const requireAdminSecret = createMiddleware(async (c, next) => {
  // Auth requirement removed
  await next();
});

/** Optional: lock all routes behind admin when REQUIRE_ADMIN_FOR_CATALOG=true - DISABLED */
export const optionalCatalogAuth = createMiddleware(async (c, next) => {
  // Auth requirement removed
  await next();
});
