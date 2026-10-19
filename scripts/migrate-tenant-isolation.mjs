import Database from "better-sqlite3";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Additive, idempotent migration. Legacy inquiry ownership is never guessed. */
export function migrateTenantIsolation(db) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='inquiries'").get();
  if (!exists) throw new Error("inquiries table must exist before tenant migration");
  const columns = new Set(db.prepare("PRAGMA table_info(inquiries)").all().map((column) => column.name));
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        tenant_type TEXT NOT NULL CHECK (tenant_type IN ('buyer','seller')),
        display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 160),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tenant_memberships (
        tenant_id TEXT NOT NULL REFERENCES tenants(id),
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('buyer_admin','buyer_member','seller_admin','seller_member')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id,user_id)
      );
      CREATE TABLE IF NOT EXISTS commercial_transactions (
        id TEXT PRIMARY KEY,
        buyer_tenant_id TEXT NOT NULL REFERENCES tenants(id),
        seller_tenant_id TEXT NOT NULL REFERENCES tenants(id),
        inquiry_id TEXT REFERENCES inquiries(id),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','fulfilled','cancelled','disputed')),
        created_at TEXT NOT NULL,
        CHECK (buyer_tenant_id <> seller_tenant_id)
      );
      CREATE TABLE IF NOT EXISTS tenant_sync_outbox (
        queue_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        peer_node_id TEXT NOT NULL,
        peer_url TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('tenant.upsert','membership.upsert','transaction.upsert')),
        aggregate_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_attempt_at_ms INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        UNIQUE (event_id, peer_node_id)
      );
      CREATE INDEX IF NOT EXISTS idx_tenant_sync_outbox_due ON tenant_sync_outbox(next_attempt_at_ms) WHERE delivered_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_tenant_sync_outbox_peer ON tenant_sync_outbox(peer_node_id,delivered_at);
            CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_status ON tenant_memberships(user_id,status);
      CREATE INDEX IF NOT EXISTS idx_transactions_buyer_status ON commercial_transactions(buyer_tenant_id,status);
      CREATE INDEX IF NOT EXISTS idx_transactions_seller_status ON commercial_transactions(seller_tenant_id,status);
    `);
    if (!columns.has("buyer_tenant_id")) db.exec("ALTER TABLE inquiries ADD COLUMN buyer_tenant_id TEXT REFERENCES tenants(id)");
    if (!columns.has("seller_tenant_id")) db.exec("ALTER TABLE inquiries ADD COLUMN seller_tenant_id TEXT REFERENCES tenants(id)");
    if (!columns.has("tenant_migration_state")) db.exec("ALTER TABLE inquiries ADD COLUMN tenant_migration_state TEXT NOT NULL DEFAULT 'unassigned' CHECK (tenant_migration_state IN ('unassigned','reviewed','assigned'))");
    db.exec("CREATE INDEX IF NOT EXISTS idx_inquiries_buyer_tenant ON inquiries(buyer_tenant_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_inquiries_seller_tenant ON inquiries(seller_tenant_id)");
    const outboxColumns = new Set(db.prepare("PRAGMA table_info(tenant_sync_outbox)").all().map((column) => column.name));
    if (!outboxColumns.has("queue_seq")) {
      db.exec("ALTER TABLE tenant_sync_outbox ADD COLUMN queue_seq INTEGER");
      db.exec("UPDATE tenant_sync_outbox SET queue_seq = rowid WHERE queue_seq IS NULL");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_sync_outbox_queue_seq ON tenant_sync_outbox(queue_seq)");
    }
  })();
  return { applied: true, legacyRowsRemainUnassigned: true };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write("Usage: node scripts/migrate-tenant-isolation.mjs <sqlite-db-path>\n");
    process.exitCode = 2;
  } else {
    const db = new Database(filePath);
    try { process.stdout.write(JSON.stringify(migrateTenantIsolation(db)) + "\n"); }
    finally { db.close(); }
  }
}
