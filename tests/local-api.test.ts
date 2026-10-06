import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { parsePeers, startLocalApi } from "../electron/local-api";

const secret = "test-sync-secret-that-is-at-least-32-characters";
type ApiResource = Awaited<ReturnType<typeof startLocalApi>> & { dir: string };
const active: ApiResource[] = [];

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function boot({ nodeId = "desktop-off", port = 0, sharedSecret = "", peers = [] as { nodeId: string; url: string }[] } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "export-client-desktop-"));
  const instance = await startLocalApi({ dbPath: path.join(dir, "db.sqlite"), port, host: "127.0.0.1", nodeId, sharedSecret, peers });
  const resource = { ...instance, dir };
  active.push(resource);
  return resource;
}

async function cleanup(resource: (typeof active)[number]) {
  const index = active.indexOf(resource);
  if (index >= 0) active.splice(index, 1);
  await resource.close();
  await rm(resource.dir, { recursive: true, force: true });
}

async function waitForTracking(url: string, trackingCode: string) {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const response = await fetch(`${url}/api/v1/inquiries/${trackingCode}`);
    if (response.ok) return response.json() as Promise<{ data: { status: string; createdAt: string; productName: string } }>;
    assert.equal(response.status, 404);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Inquiry did not replicate to ${url}`);
}

test("local health, catalog, create, and tracking match the shared API contract", async () => {
  const api = await boot();
  try {
    assert.deepEqual(await (await fetch(`${api.url}/health`)).json(), { status: "ok", nodeId: "desktop-off", syncEnabled: false });
    const products = (await (await fetch(`${api.url}/api/v1/products`)).json() as { data: Array<{ id: string }> }).data;
    assert.deepEqual(products.map((item) => item.id), ["cocoa-beans", "green-coffee", "dried-spices"]);
    const createdResponse = await fetch(`${api.url}/api/v1/inquiries`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: "Demo Client", customerEmail: "demo@example.com", destinationCountry: "Japan", productId: "green-coffee", quantity: 100 }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { trackingCode: string; status: string; createdAt: string };
    assert.match(created.trackingCode, /^[A-F0-9]{24}$/);
    assert.equal(created.status, "received");
    const tracked = await (await fetch(`${api.url}/api/v1/inquiries/${created.trackingCode}`)).json() as { data: { status: string; createdAt: string; productName: string } };
    assert.deepEqual(tracked.data, { status: "received", createdAt: created.createdAt, productName: "Kopi Arabika hijau" });
  } finally { await cleanup(api); }
});

test("sync is disabled by default and peer writes require the bearer secret", async () => {
  const disabled = await boot();
  try {
    const response = await fetch(`${disabled.url}/api/v1/sync/inquiries`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "sync_disabled");
  } finally { await cleanup(disabled); }
  const enabled = await boot({ nodeId: "desktop-auth", sharedSecret: secret });
  try {
    const denied = await fetch(`${enabled.url}/api/v1/sync/inquiries`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(denied.status, 401);
  } finally { await cleanup(enabled); }
});

test("peer replication is idempotent; conflicting payload is quarantined without overwrite", async () => {
  const portA = await freePort();
  const portB = await freePort();
  const nodeA = await boot({ nodeId: "desktop-a", port: portA, sharedSecret: secret, peers: [{ nodeId: "desktop-b", url: `http://127.0.0.1:${portB}` }] });
  const nodeB = await boot({ nodeId: "desktop-b", port: portB, sharedSecret: secret, peers: [{ nodeId: "desktop-a", url: `http://127.0.0.1:${portA}` }] });
  try {
    const createdResponse = await fetch(`${nodeA.url}/api/v1/inquiries`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: "Original Client", customerEmail: "a@example.test", destinationCountry: "Japan", productId: "green-coffee", quantity: 10 }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { trackingCode: string };
    const replicated = await waitForTracking(nodeB.url, created.trackingCode);
    assert.equal(replicated.data.status, "received");
    assert.equal(replicated.data.productName, "Kopi Arabika hijau");

    const record = nodeA.db.prepare(`SELECT id,tracking_code AS trackingCode,customer_name AS customerName,
      customer_email AS customerEmail,destination_country AS destinationCountry,product_id AS productId,
      quantity,unit,status,created_at AS createdAt,origin_node_id AS originNodeId FROM inquiries WHERE tracking_code=?`)
      .get(created.trackingCode) as Record<string, unknown>;
    const send = (body: unknown) => fetch(`${nodeB.url}/api/v1/sync/inquiries`, {
      method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const wrongUnit = await send({ ...record, id: "22222222-2222-4222-8222-222222222222", trackingCode: "B".repeat(24), unit: "piece" });
    assert.equal(wrongUnit.status, 404);
    const duplicate = await send(record);
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json() as { result: string }).result, "duplicate");

    const conflict = await send({ ...record, customerName: "Different Client" });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json() as { error: string }).error, "sync_conflict");
    const stored = nodeB.db.prepare("SELECT customer_name FROM inquiries WHERE id=?").get(record.id) as { customer_name: string } | undefined;
    const conflicts = nodeB.db.prepare("SELECT COUNT(*) AS count FROM sync_conflicts WHERE inquiry_id=?").get(record.id) as { count: number };
    assert.equal(stored?.customer_name, "Original Client");
    assert.equal(conflicts.count, 1);
    const collisionId = "33333333-3333-4333-8333-333333333333";
    const codeCollision = await send({ ...record, id: collisionId, customerName: "Tracking Code Collision" });
    assert.equal(codeCollision.status, 409);
    assert.equal((await codeCollision.json() as { error: string }).error, "sync_conflict");
    const collision = nodeB.db.prepare("SELECT reason FROM sync_conflicts WHERE inquiry_id=?").get(collisionId) as { reason: string } | undefined;
    assert.equal(collision?.reason, "tracking_code_collision");
    const preserved = nodeB.db.prepare("SELECT customer_name FROM inquiries WHERE id=?").get(record.id) as { customer_name: string } | undefined;
    assert.equal(preserved?.customer_name, "Original Client");
  } finally { await cleanup(nodeA); await cleanup(nodeB); }
});

test("peer URL validation rejects public HTTP, credentials, self, and duplicate IDs", () => {
  assert.throws(() => parsePeers("web=http://example.com:4000", "desktop-local"), /HTTPS/);
  assert.throws(() => parsePeers("web=https://user:pass@example.com", "desktop-local"), /credentials/);
  assert.throws(() => parsePeers("desktop-local=http://127.0.0.1:4000", "desktop-local"), /invalid|self/);
  assert.throws(() => parsePeers("web=http://127.0.0.1:4000,web=http://127.0.0.1:4001", "desktop-local"), /duplicate/);
});
