import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
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
    for (const table of ["tenants","tenant_memberships","commercial_transactions"]) {
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
    }
  } finally { db.close(); }
});

test("migration refuses to run without the existing inquiries table", () => {
  const db = new Database(":memory:");
  try { assert.throws(() => migrateTenantIsolation(db), /inquiries table must exist/); }
  finally { db.close(); }
});
