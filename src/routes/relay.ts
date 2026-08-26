import crypto from "node:crypto";
import { Hono } from "hono";
import { env } from "../config/env.js";
import { jsonError, jsonOk } from "../lib/envelope.js";

const relayRouter = new Hono();

type TicketPayload = {
  deviceId: string;
  userId?: string;
  scope: string;
  exp: number;
  jti: string;
};

const b64 = (value: string) => Buffer.from(value).toString("base64url");

function signPayload(payload: TicketPayload) {
  const secret = env.RELAY_TICKET_SECRET?.trim();
  if (!secret) throw new Error("RELAY_TICKET_SECRET missing");
  const body = JSON.stringify(payload);
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${b64(body)}.${mac}`;
}

relayRouter.post("/ticket", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const deviceId = String(body.deviceId || crypto.randomUUID());
    const scope = String(body.scope || "stream");
    const ttlSec = Number(body.ttlSec || 900);

    const payload: TicketPayload = {
      deviceId,
      userId: body.userId ? String(body.userId) : undefined,
      scope,
      exp: Math.floor(Date.now() / 1000) + Math.max(60, Math.min(ttlSec, 3600)),
      jti: crypto.randomUUID(),
    };

    return c.json(jsonOk({ ticket: signPayload(payload), payload }));
  } catch (error) {
    return c.json(jsonError((error as Error).message), 500);
  }
});

relayRouter.post("/turn-credentials", async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const username = String(body.deviceId || crypto.randomUUID());
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const turnUsername = `${expires}:${username}`;
  const secret = env.RELAY_TICKET_SECRET?.trim() || "dev-turn-secret";
  const credential = crypto.createHmac("sha1", secret).update(turnUsername).digest("base64");

  return c.json(jsonOk({
    username: turnUsername,
    credential,
    ttlSec: 3600,
    urls: [
      "stun:stun.l.google.com:19302",
    ],
  }));
});

relayRouter.get("/proxy-pool", (c) => {
  const urls = (env.STREAM_PROXY_URLS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  return c.json(jsonOk({
    issuedAt: Date.now(),
    nodes: urls.map((url, idx) => ({ id: `proxy-${idx + 1}`, url, status: "healthy" })),
  }));
});

relayRouter.get("/signal", (c) => {
  const upgrade = c.req.header("upgrade");
  if (!upgrade || upgrade.toLowerCase() !== "websocket") {
    return c.json(jsonError("Expected websocket upgrade"), 426);
  }
  return c.text("WebSocket signaling requires node websocket adapter.", 501);
});

export { relayRouter };