import type { MiddlewareHandler } from "hono";

export const cacheControl: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.req.method === "GET" && c.res.status === 200) {
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  }
};
