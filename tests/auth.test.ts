import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createSupabaseAuth } from "../electron/auth";

async function startApp(options: Parameters<typeof createSupabaseAuth>[0]) {
  const app = express();
  const auth = createSupabaseAuth(options);
  app.get("/session", auth.authenticate, (_req, res) => res.json({ user: res.locals.authIdentity }));
  app.get("/admin", auth.authenticate, auth.requireAdmin, (_req, res) => res.json({ ok: true }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("auth fails closed when provider is not configured", async () => {
  const app = await startApp({ url: "", anonKey: "" });
  try { assert.equal((await fetch(`${app.url}/session`)).status, 503); }
  finally { await app.close(); }
});

test("verified ID allowlist grants admin; client metadata is ignored", async () => {
  const app = await startApp({
    url: "https://auth.example.test", anonKey: "public-test-key", adminUserIds: ["admin-uuid"],
    fetcher: async (url, init) => {
      assert.equal(url, "https://auth.example.test/auth/v1/user");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer good-token");
      return new Response(JSON.stringify({ id: "admin-uuid", user_metadata: { role: "customer" } }), { status: 200 });
    },
  });
  try {
    const response = await fetch(`${app.url}/admin`, { headers: { Authorization: "Bearer good-token" } });
    assert.equal(response.status, 200);
  } finally { await app.close(); }
});

test("customer and invalid tokens cannot access admin route", async () => {
  const app = await startApp({
    url: "https://auth.example.test", anonKey: "public-test-key", adminUserIds: ["admin-uuid"],
    fetcher: async (_url, init) => String(new Headers(init?.headers).get("authorization")).endsWith("expired")
      ? new Response("{}", { status: 401 })
      : new Response(JSON.stringify({ id: "customer-uuid", user_metadata: { role: "admin" } }), { status: 200 }),
  });
  try {
    assert.equal((await fetch(`${app.url}/admin`, { headers: { Authorization: "Bearer customer-token" } })).status, 403);
    assert.equal((await fetch(`${app.url}/admin`, { headers: { Authorization: "Bearer expired" } })).status, 401);
  } finally { await app.close(); }
});

test("missing bearer token is rejected without calling the identity provider", async () => {
  let providerCalls = 0;
  const app = await startApp({
    url: "https://auth.example.test",
    anonKey: "public-test-key",
    fetcher: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "customer-uuid" }), { status: 200 });
    },
  });
  try {
    const response = await fetch(`${app.url}/session`);
    assert.equal(response.status, 401);
    assert.equal(providerCalls, 0);
  } finally {
    await app.close();
  }
});

test("identity provider outage fails closed with service unavailable", async () => {
  const app = await startApp({
    url: "https://auth.example.test",
    anonKey: "public-test-key",
    fetcher: async () => {
      throw new Error("simulated provider outage");
    },
  });
  try {
    const response = await fetch(`${app.url}/session`, {
      headers: { Authorization: "Bearer token-during-outage" },
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "identity_provider_unavailable" });
  } finally {
    await app.close();
  }
});

test("malformed identity responses are rejected rather than creating an authenticated session", async () => {
  const app = await startApp({
    url: "https://auth.example.test",
    anonKey: "public-test-key",
    fetcher: async () => new Response(JSON.stringify({ id: "   " }), { status: 200 }),
  });
  try {
    const response = await fetch(`${app.url}/session`, {
      headers: { Authorization: "Bearer malformed-identity-token" },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "invalid_identity" });
  } finally {
    await app.close();
  }
});
