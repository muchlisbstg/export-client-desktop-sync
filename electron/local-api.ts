import express, { type Express } from "express";
import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";

export type InquiryRecord = {
  id: string;
  trackingCode: string;
  customerName: string;
  customerEmail: string;
  destinationCountry: string;
  productId: string;
  quantity: number;
  unit: string;
  status: "received";
  createdAt: string;
  originNodeId: string;
};
export type Peer = { nodeId: string; url: string };
export type LocalApiOptions = { dbPath: string; port?: number; host?: string; nodeId?: string; sharedSecret?: string; peers?: Peer[]; webOrigins?: string[]; fetcher?: typeof fetch };

const PRODUCTS = [
  { id: "green-coffee", name: "Kopi Arabika hijau", category: "Kopi", origin: "Indonesia", unit: "kg" },
  { id: "dried-spices", name: "Rempah kering pilihan", category: "Rempah", origin: "Indonesia", unit: "kg" },
  { id: "cocoa-beans", name: "Biji kakao fermentasi", category: "Kakao", origin: "Indonesia", unit: "kg" },
];
const RECORD_KEYS = ["id", "trackingCode", "customerName", "customerEmail", "destinationCountry", "productId", "quantity", "unit", "status", "createdAt", "originNodeId"] as const;
const normalizeRecord = (record: InquiryRecord): InquiryRecord => Object.fromEntries(RECORD_KEYS.map((key) => [key, record[key]])) as InquiryRecord;
const hashRecord = (record: InquiryRecord) => createHash("sha256").update(JSON.stringify(normalizeRecord(record))).digest("hex");
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isInquiryRecord(value: unknown): value is InquiryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== RECORD_KEYS.length || Object.keys(record).some((key) => !RECORD_KEYS.includes(key as typeof RECORD_KEYS[number]))) return false;
  const stringKeys = RECORD_KEYS.filter((key) => key !== "quantity");
  if (stringKeys.some((key) => typeof record[key] !== "string" || !(record[key] as string).trim())) return false;
  const email = String(record.customerEmail);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(record.id))
    && /^[A-F0-9]{24}$/.test(String(record.trackingCode))
    && String(record.customerName).length >= 2 && String(record.customerName).length <= 120
    && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && String(record.destinationCountry).length >= 2 && String(record.destinationCountry).length <= 80
    && String(record.productId).length <= 80 && String(record.unit).length <= 20
    && typeof record.quantity === "number" && Number.isFinite(record.quantity) && record.quantity > 0 && record.quantity <= 1_000_000
    && record.status === "received" && !Number.isNaN(Date.parse(String(record.createdAt)))
    && /^[A-Za-z0-9._-]{1,80}$/.test(String(record.originNodeId));
}

export function parsePeers(value = "", nodeId = ""): Peer[] {
  const peers: Peer[] = [];
  const seen = new Set<string>();
  for (const entry of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const separator = entry.indexOf("=");
    if (separator <= 0) throw new Error("SYNC_PEERS must use nodeId=http(s)://host:port");
    const peerId = entry.slice(0, separator).trim();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(peerId) || peerId === nodeId || seen.has(peerId)) {
      throw new Error("SYNC_PEERS contains an invalid, duplicate, or self node ID");
    }
    let url: URL;
    try { url = new URL(entry.slice(separator + 1).trim()); } catch { throw new Error(`Invalid peer URL for ${peerId}`); }
    if (!(url.protocol === "http:" || url.protocol === "https:") || url.username || url.password || url.search || url.hash) {
      throw new Error(`Peer ${peerId} must use HTTP(S) without credentials, query, or fragment`);
    }
    if (url.protocol === "http:" && !loopbackHosts.has(url.hostname)) {
      throw new Error(`Peer ${peerId} must use HTTPS outside loopback development`);
    }
    seen.add(peerId);
    peers.push({ nodeId: peerId, url: `${url.origin}${url.pathname.replace(/\/+$/, "")}` });
  }
  return peers;
}

function isSecretMatch(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith("Bearer ") || !expected) return false;
  const received = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

function rateLimiter(limit: number) {
  const entries = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + 15 * 60_000 };
      entries.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) return res.status(429).json({ error: "rate_limit_exceeded" });
    return next();
  };
}

const selectRecord = `SELECT id, tracking_code AS trackingCode, customer_name AS customerName,
  customer_email AS customerEmail, destination_country AS destinationCountry,
  product_id AS productId, quantity, unit, status, created_at AS createdAt,
  origin_node_id AS originNodeId FROM inquiries WHERE id = ?`;

export function createLocalApi(options: LocalApiOptions): { app: Express; close: () => void; db: Database.Database; nodeId: string; syncEnabled: boolean } {
  mkdirSync(path.dirname(path.resolve(options.dbPath)), { recursive: true });
  const nodeIdConfigured = options.nodeId ?? process.env.SYNC_NODE_ID;
  const nodeId = nodeIdConfigured?.trim() || "desktop-local";
  const secret = (options.sharedSecret ?? process.env.SYNC_SHARED_SECRET ?? "").trim();
  if (secret && secret.length < 32) throw new Error("SYNC_SHARED_SECRET must contain at least 32 characters");
  if (secret && !nodeIdConfigured?.trim()) throw new Error("SYNC_NODE_ID is required when synchronization is enabled");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(nodeId)) throw new Error("SYNC_NODE_ID is invalid");
  const peers = options.peers ?? parsePeers(process.env.SYNC_PEERS ?? "", nodeId);
  if (peers.some((peer) => peer.nodeId === nodeId) || new Set(peers.map((peer) => peer.nodeId)).size !== peers.length) {
    throw new Error("SYNC_PEERS IDs must be unique and cannot include this node");
  }
  const syncEnabled = Boolean(secret);
  const db = new Database(options.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, origin TEXT NOT NULL,
      unit TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY, tracking_code TEXT NOT NULL UNIQUE, customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL, destination_country TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL CHECK(quantity > 0),
      unit TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received', created_at TEXT NOT NULL,
      origin_node_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      conflict_id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id TEXT NOT NULL, peer_node_id TEXT NOT NULL,
      existing_hash TEXT NOT NULL, incoming_hash TEXT NOT NULL, reason TEXT NOT NULL, detected_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
      inquiry_id TEXT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
      peer_node_id TEXT NOT NULL, peer_url TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at_ms INTEGER NOT NULL DEFAULT 0, last_error TEXT,
      PRIMARY KEY(inquiry_id, peer_node_id)
    );
  `);
  const productColumns = db.prepare("PRAGMA table_info(products)").all() as Array<{ name: string }>;
  if (!productColumns.some((column) => column.name === "active")) db.exec("ALTER TABLE products ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  const productInsert = db.prepare("INSERT OR IGNORE INTO products (id,name,category,origin,unit) VALUES (@id,@name,@category,@origin,@unit)");
  for (const product of PRODUCTS) productInsert.run(product);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  const createLimit = rateLimiter(Number(process.env.RFQ_LIMIT_PER_15M) || 10);
  const trackLimit = rateLimiter(Number(process.env.TRACK_LOOKUP_LIMIT_PER_15M) || 60);
  const insertInquiry = db.prepare(`INSERT INTO inquiries
    (id,tracking_code,customer_name,customer_email,destination_country,product_id,quantity,unit,status,created_at,origin_node_id)
    VALUES (@id,@trackingCode,@customerName,@customerEmail,@destinationCountry,@productId,@quantity,@unit,@status,@createdAt,@originNodeId)`);
  const insertOutbox = db.prepare(`INSERT OR IGNORE INTO sync_outbox
    (inquiry_id,peer_node_id,peer_url,next_attempt_at_ms) VALUES (?,?,?,0)`);
  const fetcher = options.fetcher ?? fetch;
  let timer: NodeJS.Timeout | undefined;
  let flushing = false;

  function queueRecord(record: InquiryRecord) {
    if (!secret || peers.length === 0) return;
    const transaction = db.transaction(() => {
      for (const peer of peers) {
        if (peer.nodeId === nodeId || peer.nodeId === record.originNodeId) continue;
        insertOutbox.run(record.id, peer.nodeId, peer.url);
      }
    });
    transaction();
    void flushOutbox();
  }

  function insertConflict(record: InquiryRecord, existing: InquiryRecord, peerNodeId: string, reason: string) {
    const existingHash = hashRecord(existing);
    const incomingHash = hashRecord(record);
    db.prepare(`INSERT INTO sync_conflicts
      (inquiry_id,peer_node_id,existing_hash,incoming_hash,reason,detected_at) VALUES (?,?,?,?,?,?)`)
      .run(record.id, peerNodeId, existingHash, incomingHash, reason, new Date().toISOString());
    return { existingHash, incomingHash };
  }

  function storeRecord(record: InquiryRecord, peerNodeId = record.originNodeId) {
    const byId = db.prepare(selectRecord).get(record.id) as InquiryRecord | undefined;
    const byCode = db.prepare(selectRecord.replace("WHERE id = ?", "WHERE tracking_code = ?")).get(record.trackingCode) as InquiryRecord | undefined;
    const existing = byId ?? byCode;
    if (existing) {
      if (hashRecord(existing) === hashRecord(record)) return { result: "duplicate" as const };
      return { result: "conflict" as const, ...insertConflict(record, existing, peerNodeId, byId ? "record_mismatch" : "tracking_code_collision") };
    }
    const product = db.prepare("SELECT unit FROM products WHERE id = ? AND active = 1").get(record.productId) as { unit: string } | undefined;
    if (!product || product.unit !== record.unit) return { result: "product_not_found" as const };
    insertInquiry.run(record);
    queueRecord(record);
    return { result: "inserted" as const };
  }

  async function flushOutbox() {
    if (flushing || !secret || peers.length === 0) return;
    flushing = true;
    try {
      const items = db.prepare(`SELECT inquiry_id AS inquiryId, peer_node_id AS peerNodeId,
        peer_url AS peerUrl, attempt_count AS attemptCount FROM sync_outbox
        WHERE next_attempt_at_ms <= ? ORDER BY next_attempt_at_ms LIMIT 20`).all(Date.now()) as Array<{ inquiryId: string; peerNodeId: string; peerUrl: string; attemptCount: number }>;
      for (const item of items) {
        const record = db.prepare(selectRecord).get(item.inquiryId) as InquiryRecord | undefined;
        if (!record) {
          db.prepare("DELETE FROM sync_outbox WHERE inquiry_id = ? AND peer_node_id = ?").run(item.inquiryId, item.peerNodeId);
          continue;
        }
        try {
          const response = await fetcher(`${item.peerUrl}/api/v1/sync/inquiries`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
            body: JSON.stringify(record),
            signal: AbortSignal.timeout(5_000),
          });
          if (response.ok) {
            db.prepare("DELETE FROM sync_outbox WHERE inquiry_id = ? AND peer_node_id = ?").run(item.inquiryId, item.peerNodeId);
          } else if (response.status === 409) {
            const body = await response.json().catch(() => ({})) as { existingHash?: string; incomingHash?: string };
            db.prepare(`INSERT INTO sync_conflicts
              (inquiry_id,peer_node_id,existing_hash,incoming_hash,reason,detected_at) VALUES (?,?,?,?,?,?)`)
              .run(item.inquiryId, item.peerNodeId, body.existingHash ?? hashRecord(record), body.incomingHash ?? "unknown", "remote_conflict", new Date().toISOString());
            db.prepare("DELETE FROM sync_outbox WHERE inquiry_id = ? AND peer_node_id = ?").run(item.inquiryId, item.peerNodeId);
          } else {
            throw new Error(`peer_http_${response.status}`);
          }
        } catch (error) {
          const attempts = item.attemptCount + 1;
          const waitMs = Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8));
          db.prepare(`UPDATE sync_outbox SET attempt_count = ?, next_attempt_at_ms = ?, last_error = ?
            WHERE inquiry_id = ? AND peer_node_id = ?`).run(
            attempts, Date.now() + waitMs, error instanceof Error ? error.message.slice(0, 120) : "sync_error",
            item.inquiryId, item.peerNodeId
          );
        }
      }
    } finally {
      flushing = false;
    }
  }

  app.get("/health", (_req, res) => { db.prepare("SELECT 1").get(); res.json({ status: "ok", nodeId, syncEnabled }); });
  app.get("/api/v1/products", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ data: db.prepare("SELECT id,name,category,origin,unit FROM products WHERE active = 1 ORDER BY name").all() });
  });
  app.post("/api/v1/inquiries", createLimit, (req, res) => {
    const input = req.body ?? {};
    const customerName = typeof input.customerName === "string" ? input.customerName.trim() : "";
    const customerEmail = typeof input.customerEmail === "string" ? input.customerEmail.trim() : "";
    const destinationCountry = typeof input.destinationCountry === "string" ? input.destinationCountry.trim() : "";
    const productId = typeof input.productId === "string" ? input.productId.trim() : "";
    const quantity = Number(input.quantity);
    if (customerName.length < 2 || customerName.length > 120 || customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
      || destinationCountry.length < 2 || destinationCountry.length > 80 || productId.length < 1 || productId.length > 80
      || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return res.status(400).json({ error: "invalid_request" });
    const product = db.prepare("SELECT id,unit FROM products WHERE id = ? AND active = 1").get(productId) as { id: string; unit: string } | undefined;
    if (!product) return res.status(404).json({ error: "product_not_found" });
    let trackingCode = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = randomBytes(12).toString("hex").toUpperCase();
      if (!db.prepare("SELECT 1 FROM inquiries WHERE tracking_code = ?").get(candidate)) { trackingCode = candidate; break; }
    }
    if (!trackingCode) return res.status(503).json({ error: "tracking_code_unavailable" });
    const record: InquiryRecord = {
      id: randomUUID(), trackingCode, customerName, customerEmail, destinationCountry,
      productId, quantity, unit: product.unit, status: "received", createdAt: new Date().toISOString(), originNodeId: nodeId,
    };
    insertInquiry.run(record);
    queueRecord(record);
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({ trackingCode, status: record.status, createdAt: record.createdAt });
  });
  app.post("/api/v1/sync/inquiries", (req, res) => {
    if (!secret) return res.status(503).json({ error: "sync_disabled" });
    if (!isSecretMatch(req.header("authorization"), secret)) return res.status(401).json({ error: "unauthorized" });
    if (!isInquiryRecord(req.body)) return res.status(400).json({ error: "invalid_sync_record" });
    const result = storeRecord(req.body, req.body.originNodeId);
    if (result.result === "product_not_found") return res.status(404).json({ error: "product_not_found" });
    if (result.result === "conflict") return res.status(409).json({ error: "sync_conflict", ...result });
    return res.status(result.result === "inserted" ? 201 : 200).json({ result: result.result });
  });
  app.get("/api/v1/inquiries/:trackingCode", trackLimit, (req, res) => {
    const code = String(req.params.trackingCode ?? "").trim().toUpperCase();
    if (!/^[A-F0-9]{24}$/.test(code)) return res.status(400).json({ error: "invalid_tracking_code" });
    const result = db.prepare(`SELECT i.status, i.created_at AS createdAt, p.name AS productName
      FROM inquiries i JOIN products p ON p.id = i.product_id WHERE i.tracking_code = ?`).get(code);
    res.setHeader("Cache-Control", "no-store");
    if (!result) return res.status(404).json({ error: "inquiry_not_found" });
    return res.json({ data: result });
  });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError) return res.status(400).json({ error: "invalid_json" });
    return res.status(500).json({ error: "internal_server_error" });
  });

  if (secret && peers.length > 0) {
    const existing = db.prepare("SELECT id,origin_node_id AS originNodeId FROM inquiries").all() as Array<{ id: string; originNodeId: string }>;
    for (const row of existing) queueRecord({ id: row.id, originNodeId: row.originNodeId } as InquiryRecord);
    timer = setInterval(() => void flushOutbox(), 2_000);
    timer.unref();
    void flushOutbox();
  }

  return {
    app,
    db,
    nodeId,
    syncEnabled,
    close: () => { if (timer) clearInterval(timer); if (db.open) db.close(); },
  };
}

export function startLocalApi(options: LocalApiOptions): Promise<{ url: string; close: () => Promise<void>; db: Database.Database; nodeId: string }> {
  const local = createLocalApi(options);
  const server = http.createServer(local.app);
  const host = options.host || process.env.API_HOST || "127.0.0.1";
  const port = options.port ?? Number(process.env.API_PORT || 4002);
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => { server.off("listening", onListening); local.close(); reject(error); };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://${host}:${address.port}`,
        db: local.db,
        nodeId: local.nodeId,
        close: () => new Promise<void>((done) => {
          server.close(() => { local.close(); done(); });
        }),
      });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}
