import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { log } from "./logger.js";
import { jsonError } from "../lib/envelope.js";

export function onError(err: Error, c: Context) {
  if (err instanceof HTTPException) {
    return c.json(jsonError(err.message), err.status);
  }
  log.error({ err }, "unhandled error");
  return c.json(jsonError("Internal Server Error"), 500);
}

export function notFound(c: Context) {
  return c.json(jsonError("Not Found"), 404);
}
