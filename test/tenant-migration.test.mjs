import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrateTenantIsolation } from "../scripts/migrate-tenant-isolation.mjs";

function legacyDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY);
    CREATE TABLE inquiries (id TEXT PRIMARY KEY, tracking_code TEXT NOT NULL UNIQUE, customer_email TEXT NOT NULL, origin_node_id TEXT NOT NULL DEFAULT 'legacy');
    INSERT INTO inquiries (id, tracking_code, customer_email, origin_node_id)
      VALUES ('legacy-1', 'ABCDEF0123456789ABCDEF01', 'old@example.test', 'legacy');
  `);
  return db;
}

test("legacy inquiry ownership stays null and unassigned", () => {
  const db = legacyDb();
  try {
    migrateTenantIsolation(db);
    const row = db.prepare("SELECT buyer_tenant_id,seller_tenant_id,tenant_migration_state FROM inquiries WHERE id='legacy-1'").get();
    assert.equal(row.buyer_tenant_id, null);
    assert.equal(row.seller_tenant_id, null);
    assert.equal(row.tenant_migration_state, "unassigned");
  } finally { db.close(); }
});

test("migration is idempotent and creates tenant model tables", () => {
  const db = legacyDb();
  try {
    assert.doesNotThrow(() => migrateTenantIsolation(db));
    assert.doesNotThrow(() => migrateTenantIsolation(db));
    for (const table of ["tenants","tenant_memberships","commercial_transactions","tenant_sync_outbox"]) {
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
    }
  } finally { db.close(); }
});

test("migration refuses to run without the existing inquiries table", () => {
  const db = new Database(":memory:");
  try { assert.throws(() => migrateTenantIsolation(db), /inquiries table must exist/); }
  finally { db.close(); }
});


test("migration runs on an isolated representative SQLite backup and leaves source untouched", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-migration-copy-"));
  const source = new Database(":memory:");
  let copy;
  try {
    source.pragma("foreign_keys = ON");
    source.exec(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
        origin TEXT NOT NULL, unit TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE inquiries (
        id TEXT PRIMARY KEY, tracking_code TEXT NOT NULL UNIQUE, customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL, destination_country TEXT NOT NULL,
        product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL CHECK(quantity > 0),
        unit TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received', created_at TEXT NOT NULL,
        origin_node_id TEXT NOT NULL DEFAULT 'legacy'
      );
      CREATE TABLE sync_outbox (
        inquiry_id TEXT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE, peer_node_id TEXT NOT NULL,
        peer_url TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at_ms INTEGER NOT NULL DEFAULT 0, last_error TEXT,
        PRIMARY KEY(inquiry_id,peer_node_id)
      );
      CREATE TABLE sync_conflicts (
        conflict_id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id TEXT NOT NULL, peer_node_id TEXT NOT NULL,
        existing_hash TEXT NOT NULL, incoming_hash TEXT NOT NULL, reason TEXT NOT NULL, detected_at TEXT NOT NULL
      );
      INSERT INTO products (id,name,category,origin,unit,active) VALUES ('green-coffee','Green Coffee','Coffee','Indonesia','kg',1);
      INSERT INTO inquiries (id,tracking_code,customer_name,customer_email,destination_country,product_id,quantity,unit,status,created_at,origin_node_id)
      VALUES ('legacy-row','ABCDEF0123456789ABCDEF01','Legacy Buyer','buyer@example.test','Japan','green-coffee',100,'kg','received','2026-01-01T00:00:00.000Z','legacy');
      INSERT INTO sync_outbox (inquiry_id,peer_node_id,peer_url) VALUES ('legacy-row','peer-a','https://peer.example.test');
    `);
    const copyPath = path.join(directory, "representative-copy.sqlite");
    await source.backup(copyPath);
    copy = new Database(copyPath);
    copy.pragma("foreign_keys = ON");
    assert.deepEqual(copy.prepare("PRAGMA integrity_check").all(), [{ integrity_check: "ok" }]);
    migrateTenantIsolation(copy);
    assert.deepEqual(copy.prepare("PRAGMA integrity_check").all(), [{ integrity_check: "ok" }]);
    assert.deepEqual(copy.prepare("PRAGMA foreign_key_check").all(), []);
    const migrated = copy.prepare("SELECT id,tracking_code,customer_email,buyer_tenant_id,seller_tenant_id,tenant_migration_state FROM inquiries WHERE id='legacy-row'").get();
    assert.deepEqual(migrated, {
      id: "legacy-row", tracking_code: "ABCDEF0123456789ABCDEF01", customer_email: "buyer@example.test",
      buyer_tenant_id: null, seller_tenant_id: null, tenant_migration_state: "unassigned",
    });
    assert.equal(copy.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get().count, 1);
    assert.equal(source.prepare("SELECT COUNT(*) AS count FROM inquiries").get().count, 1);
    assert.equal(source.prepare("PRAGMA table_info(inquiries)").all().some((column) => column.name === "buyer_tenant_id"), false);
  } finally {
    if (copy?.open) copy.close();
    source.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test("tenant synchronization outbox persists retryable events across database reopen", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-outbox-"));
  const file = path.join(directory, "outbox.sqlite");
  let db = new Database(file);
  try {
    db.exec("CREATE TABLE inquiries (id TEXT PRIMARY KEY)");
    migrateTenantIsolation(db);
    db.prepare(`INSERT INTO tenant_sync_outbox
      (event_id,peer_node_id,peer_url,event_type,aggregate_id,payload_json,attempt_count,next_attempt_at_ms,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      "event-1","peer-b","https://peer.example.test","transaction.upsert","txn-1",
      JSON.stringify({ id: "txn-1", status: "pending" }),2,Date.now()+5000,new Date().toISOString()
    );
  } finally { db.close(); }
  db = new Database(file);
  try {
    const event = db.prepare("SELECT event_id,peer_node_id,event_type,aggregate_id,attempt_count,payload_json,delivered_at FROM tenant_sync_outbox WHERE event_id='event-1'").get();
    assert.equal(event.peer_node_id,"peer-b");
    assert.equal(event.event_type,"transaction.upsert");
    assert.equal(event.aggregate_id,"txn-1");
    assert.equal(event.attempt_count,2);
    assert.deepEqual(JSON.parse(event.payload_json),{id:"txn-1",status:"pending"});
    assert.equal(event.delivered_at,null);
  } finally {
    db.close();
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
