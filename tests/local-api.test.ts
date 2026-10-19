import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { parsePeers, startLocalApi } from "../electron/local-api";
import { migrateTenantIsolation } from "../scripts/migrate-tenant-isolation.mjs";

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

async function boot({ nodeId = "desktop-off", port = 0, sharedSecret = "", peers = [] as { nodeId: string; url: string }[], supabaseUrl = "https://auth.example.test", supabaseAnonKey = "test-anon-key", authFetcher = async (_url: string | URL | Request, init?: RequestInit) => {
  const token = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "").replace(/^Bearer /, "");
  const ids: Record<string,string> = { "buyer-token": "buyer-admin", "seller-token": "seller-admin", "member-token": "buyer-member", "outsider-token": "outsider" };
  return new Response(JSON.stringify({ id: ids[token] ?? "unknown-user" }), { status: token === "expired" ? 401 : 200 });
} } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "export-client-desktop-"));
  const instance = await startLocalApi({ dbPath: path.join(dir, "db.sqlite"), port, host: "127.0.0.1", nodeId, sharedSecret, peers, supabaseUrl, supabaseAnonKey, authFetcher });
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

async function waitForOutboxState(
  db: ApiResource["db"],
  inquiryId: string,
  peerNodeId: string,
  condition: (row: { attemptCount: number } | undefined) => boolean,
  expectedState: string,
): Promise<{ attemptCount: number } | undefined> {
  const find = db.prepare("SELECT attempt_count AS attemptCount FROM sync_outbox WHERE inquiry_id=? AND peer_node_id=?");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const row = find.get(inquiryId, peerNodeId) as { attemptCount: number } | undefined;
    if (condition(row)) return row;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Outbox did not reach ${expectedState} for ${inquiryId} -> ${peerNodeId}`);
}

test("local health, catalog, create, and tracking match the shared API contract", async () => {
  const api = await boot();
  try {
    assert.deepEqual(await (await fetch(`${api.url}/health`)).json(), {
      status: "ok", nodeId: "desktop-off", syncEnabled: false,
      syncStatus: { enabled: false, peerCount: 0, pendingDeliveries: 0, retryingDeliveries: 0, conflicts: 0 },
    });
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

test("JSON parser errors use stable 400 and 413 responses", async () => {
  const api = await boot();
  try {
    const malformed = await fetch(`${api.url}/api/v1/inquiries`, {
      method: "POST", headers: { "content-type": "application/json" }, body: '{"customerName":',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "invalid_json" });

    const oversized = await fetch(`${api.url}/api/v1/inquiries`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(17 * 1024) }),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "payload_too_large" });
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

test("outbound replication waits for both a secret and a configured peer", async () => {
  const peerPort = await freePort();
  const partialConfigurations = [
    { nodeId: "desktop-secret-only", sharedSecret: secret },
    { nodeId: "desktop-peers-only", peers: [{ nodeId: "desktop-target", url: `http://127.0.0.1:${peerPort}` }] },
  ];

  for (const options of partialConfigurations) {
    const api = await boot(options);
    try {
      const created = await fetch(`${api.url}/api/v1/inquiries`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerName: "Partial Config Client", customerEmail: "partial@example.com", destinationCountry: "Japan", productId: "green-coffee", quantity: 50 }),
      });
      assert.equal(created.status, 201);
      const { count } = api.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get() as { count: number };
      assert.equal(count, 0, `${options.nodeId} must not queue outbound sync with partial configuration`);
    } finally { await cleanup(api); }
  }
});

test("persistent outbox resumes delivery after the peer returns and the node restarts", async () => {
  const sourcePort = await freePort();
  const targetPort = await freePort();
  const peerNodeId = "desktop-recovery-target";
  const source = await boot({
    nodeId: "desktop-recovery-source",
    port: sourcePort,
    sharedSecret: secret,
    peers: [{ nodeId: peerNodeId, url: `http://127.0.0.1:${targetPort}` }],
  });
  let sourceClosed = false;
  let target: ApiResource | undefined;
  let restarted: ApiResource | undefined;
  try {
    const createdResponse = await fetch(`${source.url}/api/v1/inquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: "Recovery Client", customerEmail: "recovery@example.test", destinationCountry: "Japan", productId: "green-coffee", quantity: 5 }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { trackingCode: string };
    const sourceRecord = source.db.prepare("SELECT id FROM inquiries WHERE tracking_code=?").get(created.trackingCode) as { id: string } | undefined;
    assert(sourceRecord);
    const failedAttempt = await waitForOutboxState(source.db, sourceRecord.id, peerNodeId, (row) => (row?.attemptCount ?? 0) >= 1, "a persisted failed attempt");
    assert.ok((failedAttempt?.attemptCount ?? 0) >= 1);
    const pendingStatus = await (await fetch(`${source.url}/health`)).json() as { syncStatus: { enabled: boolean; peerCount: number; pendingDeliveries: number; retryingDeliveries: number; conflicts: number; peerUrl?: string; lastError?: string } };
    assert.deepEqual(pendingStatus.syncStatus, { enabled: true, peerCount: 1, pendingDeliveries: 1, retryingDeliveries: 1, conflicts: 0 });
    assert.equal("peerUrl" in pendingStatus.syncStatus, false);
    assert.equal("lastError" in pendingStatus.syncStatus, false);

    await source.close();
    sourceClosed = true;
    const sourceIndex = active.indexOf(source);
    if (sourceIndex >= 0) active.splice(sourceIndex, 1);

    target = await boot({ nodeId: peerNodeId, port: targetPort, sharedSecret: secret });
    const restartedInstance = await startLocalApi({
      dbPath: path.join(source.dir, "db.sqlite"),
      port: sourcePort,
      host: "127.0.0.1",
      nodeId: "desktop-recovery-source",
      sharedSecret: secret,
      peers: [{ nodeId: peerNodeId, url: `http://127.0.0.1:${targetPort}` }],
    });
    restarted = { ...restartedInstance, dir: source.dir };
    active.push(restarted);
    const replicated = await waitForTracking(target.url, created.trackingCode);
    assert.equal(replicated.data.productName, "Kopi Arabika hijau");
    await waitForOutboxState(restarted.db, sourceRecord.id, peerNodeId, (row) => !row, "successful delivery and outbox removal");
    const recoveredStatus = await (await fetch(`${restarted.url}/health`)).json() as { syncStatus: { pendingDeliveries: number } };
    assert.equal(recoveredStatus.syncStatus.pendingDeliveries, 0);
  } finally {
    if (restarted) await cleanup(restarted);
    if (target) await cleanup(target);
    if (!sourceClosed) await cleanup(source);
    else if (!restarted) await rm(source.dir, { recursive: true, force: true });
  }
});

test("three-node sync forwards inquiries transitively and stops duplicate echoes", async () => {
  const portA = await freePort();
  const portB = await freePort();
  const portC = await freePort();
  const nodeA = await boot({
    nodeId: "desktop-hop-a",
    port: portA,
    sharedSecret: secret,
    peers: [{ nodeId: "desktop-hop-b", url: `http://127.0.0.1:${portB}` }],
  });
  const nodeB = await boot({
    nodeId: "desktop-hop-b",
    port: portB,
    sharedSecret: secret,
    peers: [
      { nodeId: "desktop-hop-a", url: `http://127.0.0.1:${portA}` },
      { nodeId: "desktop-hop-c", url: `http://127.0.0.1:${portC}` },
    ],
  });
  const nodeC = await boot({
    nodeId: "desktop-hop-c",
    port: portC,
    sharedSecret: secret,
    peers: [{ nodeId: "desktop-hop-b", url: `http://127.0.0.1:${portB}` }],
  });

  try {
    const createdResponse = await fetch(`${nodeA.url}/api/v1/inquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: "Three Node Client", customerEmail: "three-node@example.test", destinationCountry: "Japan", productId: "green-coffee", quantity: 8 }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { trackingCode: string };
    const sourceRecord = nodeA.db.prepare("SELECT id FROM inquiries WHERE tracking_code=?").get(created.trackingCode) as { id: string } | undefined;
    assert(sourceRecord);

    const atB = await waitForTracking(nodeB.url, created.trackingCode);
    const atC = await waitForTracking(nodeC.url, created.trackingCode);
    assert.equal(atB.data.productName, "Kopi Arabika hijau");
    assert.equal(atC.data.productName, "Kopi Arabika hijau");

    await waitForOutboxState(nodeA.db, sourceRecord.id, "desktop-hop-b", (row) => !row, "delivery to middle peer");
    await waitForOutboxState(nodeB.db, sourceRecord.id, "desktop-hop-c", (row) => !row, "forwarding to final peer");
    await waitForOutboxState(nodeC.db, sourceRecord.id, "desktop-hop-b", (row) => !row, "duplicate echo acknowledgement");

    for (const [label, node] of [["A", nodeA], ["B", nodeB], ["C", nodeC]] as const) {
      const stored = node.db.prepare("SELECT COUNT(*) AS count, MIN(origin_node_id) AS originNodeId FROM inquiries WHERE id=?").get(sourceRecord.id) as { count: number; originNodeId: string };
      assert.equal(stored.count, 1, `node ${label} must store exactly one copy`);
      assert.equal(stored.originNodeId, "desktop-hop-a", `node ${label} must preserve the origin node ID`);
      const outbox = node.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE inquiry_id=?").get(sourceRecord.id) as { count: number };
      const conflicts = node.db.prepare("SELECT COUNT(*) AS count FROM sync_conflicts WHERE inquiry_id=?").get(sourceRecord.id) as { count: number };
      assert.equal(outbox.count, 0, `node ${label} outbox must drain`);
      assert.equal(conflicts.count, 0, `node ${label} must not record a conflict`);
    }
  } finally {
    await Promise.all([cleanup(nodeA), cleanup(nodeB), cleanup(nodeC)]);
  }
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
    const syncStatus = await (await fetch(`${nodeB.url}/health`)).json() as { syncStatus: { conflicts: number; pendingDeliveries: number } };
    assert.equal(syncStatus.syncStatus.conflicts, 2);
    assert.equal(syncStatus.syncStatus.pendingDeliveries, 0);
  } finally { await cleanup(nodeA); await cleanup(nodeB); }
});

test("HTTP IPv6 loopback peers are accepted for local development", () => {
  assert.deepEqual(parsePeers("web=http://[::1]:4000", "desktop-local"), [
    { nodeId: "web", url: "http://[::1]:4000" },
  ]);
});

test("peer URL validation rejects public HTTP, credentials, self, and duplicate IDs", () => {
  assert.throws(() => parsePeers("web=http://example.com:4000", "desktop-local"), /HTTPS/);
  assert.throws(() => parsePeers("web=https://user:pass@example.com", "desktop-local"), /credentials/);
  assert.throws(() => parsePeers("desktop-local=http://127.0.0.1:4000", "desktop-local"), /invalid|self/);
  assert.throws(() => parsePeers("web=http://127.0.0.1:4000,web=http://127.0.0.1:4001", "desktop-local"), /duplicate/);
});


test("tenant transaction reads and writes are isolated by active membership and role", async () => {
  const api = await boot();
  try {
    migrateTenantIsolation(api.db);
    const db = api.db;
    const now = new Date().toISOString();
    db.prepare("INSERT INTO tenants (id,tenant_type,display_name,created_at) VALUES (?,?,?,?)").run("buyer-a","buyer","Buyer A",now);
    db.prepare("INSERT INTO tenants (id,tenant_type,display_name,created_at) VALUES (?,?,?,?)").run("seller-a","seller","Seller A",now);
    db.prepare("INSERT INTO tenants (id,tenant_type,display_name,created_at) VALUES (?,?,?,?)").run("buyer-b","buyer","Buyer B",now);
    const membership = db.prepare("INSERT INTO tenant_memberships (tenant_id,user_id,role,status,created_at) VALUES (?,?,?,'active',?)");
    membership.run("buyer-a","buyer-admin","buyer_admin",now);
    membership.run("buyer-a","buyer-member","buyer_member",now);
    membership.run("seller-a","seller-admin","seller_admin",now);
    membership.run("buyer-b","outsider","buyer_admin",now);

    const headers = (token: string, tenantId: string) => ({ authorization: `Bearer ${token}`, "x-active-tenant-id": tenantId, "content-type": "application/json" });
    const noAuth = await fetch(`${api.url}/api/v1/transactions`, { headers: { "x-active-tenant-id": "buyer-a" } });
    assert.equal(noAuth.status, 401);
    const noTenant = await fetch(`${api.url}/api/v1/transactions`, { headers: { authorization: "Bearer buyer-token" } });
    assert.equal(noTenant.status, 400);

    const createdResponse = await fetch(`${api.url}/api/v1/transactions`, {
      method: "POST", headers: headers("buyer-token","buyer-a"),
      body: JSON.stringify({ buyerTenantId: "buyer-b", sellerTenantId: "seller-a" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json() as {data:{id:string;buyerTenantId:string}}).data;
    assert.equal(created.buyerTenantId, "buyer-a");

    const list = await fetch(`${api.url}/api/v1/transactions`, { headers: headers("buyer-token","buyer-a") });
    assert.equal(((await list.json()) as {data:unknown[]}).data.length, 1);
    const crossTenantRead = await fetch(`${api.url}/api/v1/transactions/${created.id}`, { headers: headers("outsider-token","buyer-b") });
    assert.equal(crossTenantRead.status, 404);
    const forgedTenant = await fetch(`${api.url}/api/v1/transactions`, { headers: headers("outsider-token","buyer-a") });
    assert.equal(forgedTenant.status, 403);

    const memberWrite = await fetch(`${api.url}/api/v1/transactions/${created.id}/status`, {
      method: "PATCH", headers: headers("member-token","buyer-a"), body: JSON.stringify({ status: "cancelled" }),
    });
    assert.equal(memberWrite.status, 403);
    const accepted = await fetch(`${api.url}/api/v1/transactions/${created.id}/status`, {
      method: "PATCH", headers: headers("seller-token","seller-a"), body: JSON.stringify({ status: "accepted" }),
    });
    assert.equal(accepted.status, 200);
    const fulfilled = await fetch(`${api.url}/api/v1/transactions/${created.id}/status`, {
      method: "PATCH", headers: headers("seller-token","seller-a"), body: JSON.stringify({ status: "fulfilled" }),
    });
    assert.equal(fulfilled.status, 200);
    const terminalWrite = await fetch(`${api.url}/api/v1/transactions/${created.id}/status`, {
      method: "PATCH", headers: headers("buyer-token","buyer-a"), body: JSON.stringify({ status: "cancelled" }),
    });
    assert.equal(terminalWrite.status, 403);
  } finally {
    await cleanup(api);
  }
});

test("tenant sync endpoint accepts trusted peer bundles and rejects invalid peers", async () => {
  const secret = "tenant-sync-test-secret-at-least-32-chars";
  const api = await boot({ sharedSecret: secret, peers: [{ nodeId: "peer-a", url: "http://127.0.0.1:6553" }] });
  try {
    migrateTenantIsolation(api.db);
    const timestamp = new Date().toISOString();
    const payload = {
      transaction: { id: "txn-sync-1", buyerTenantId: "buyer-sync", sellerTenantId: "seller-sync", inquiryId: null, status: "pending", createdAt: timestamp },
      tenants: [
        { id: "buyer-sync", tenantType: "buyer", displayName: "Buyer Sync", status: "active", createdAt: timestamp },
        { id: "seller-sync", tenantType: "seller", displayName: "Seller Sync", status: "active", createdAt: timestamp },
      ],
      memberships: [
        { tenantId: "buyer-sync", userId: "buyer-user", role: "buyer_admin", status: "active", createdAt: timestamp },
        { tenantId: "seller-sync", userId: "seller-user", role: "seller_admin", status: "active", createdAt: timestamp },
      ],
    };
    const body = JSON.stringify({ eventId: "event-sync-1", eventType: "transaction.upsert", payload });
    const denied = await fetch(api.url + "/api/v1/sync/tenants", {
      method: "POST", headers: { authorization: "Bearer wrong-secret", "x-sync-peer": "peer-a", "content-type": "application/json" }, body,
    });
    assert.equal(denied.status, 401);
    const applied = await fetch(api.url + "/api/v1/sync/tenants", {
      method: "POST", headers: { authorization: "Bearer " + secret, "x-sync-peer": "peer-a", "content-type": "application/json" }, body,
    });
    assert.equal(applied.status, 200);
    assert.equal((api.db.prepare("SELECT status FROM commercial_transactions WHERE id='txn-sync-1'").get() as {status:string}).status, "pending");
    assert.equal((api.db.prepare("SELECT COUNT(*) AS count FROM tenant_memberships WHERE tenant_id IN ('buyer-sync','seller-sync')").get() as {count:number}).count, 2);
    const unknownPeer = await fetch(api.url + "/api/v1/sync/tenants", {
      method: "POST", headers: { authorization: "Bearer " + secret, "x-sync-peer": "not-configured", "content-type": "application/json" }, body,
    });
    assert.equal(unknownPeer.status, 403);
  } finally { await cleanup(api); }
});
