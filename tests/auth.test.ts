import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { createSupabaseAuth } from "../electron/auth";

async function startApp(options) {
  const app = express();
  const auth = createSupabaseAuth(options);
  app.get("/session", auth.authenticate, (_req, res) => res.json({ user: res.locals.authIdentity }));
  app.get("/admin", auth.authenticate, auth.requireAdmin, (_req, res) => res.json({ ok: true }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`, close: () => new Promise((resolve) => server.close(resolve)) };
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
      assert.equal(init.headers.Authorization, "Bearer good-token");
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
    fetcher: async (_url, init) => init.headers.Authorization.endsWith("expired")
      ? new Response("{}", { status: 401 })
      : new Response(JSON.stringify({ id: "customer-uuid", user_metadata: { role: "admin" } }), { status: 200 }),
  });
  try {
    assert.equal((await fetch(`${app.url}/admin`, { headers: { Authorization: "Bearer customer-token" } })).status, 403);
    assert.equal((await fetch(`${app.url}/admin`, { headers: { Authorization: "Bearer expired" } })).status, 401);
  } finally { await app.close(); }
});
