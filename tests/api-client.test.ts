import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../src/shared/api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("catalog request uses the shared API route and strips trailing slashes", async () => {
  let requestedUrl = "";
  const client = createApiClient("http://localhost:4000///", async (input) => {
    requestedUrl = String(input);
    return jsonResponse({ data: [{ id: "green-coffee", name: "Kopi Arabika hijau", category: "Kopi", origin: "Indonesia", unit: "kg" }] });
  });

  const products = await client.getProducts();
  assert.equal(requestedUrl, "http://localhost:4000/api/v1/products");
  assert.equal(products[0]?.id, "green-coffee");
});

test("new inquiry posts the existing web/mobile payload contract", async () => {
  let requestInit: RequestInit | undefined;
  const client = createApiClient("https://api.example.test", async (_input, init) => {
    requestInit = init;
    return jsonResponse({ trackingCode: "A1B2C3D4E5F60718293A4B5C", status: "received", createdAt: "2026-10-07T00:00:00.000Z" }, 201);
  });

  const result = await client.createInquiry({
    customerName: "Demo User",
    customerEmail: "demo@example.test",
    destinationCountry: "Japan",
    productId: "green-coffee",
    quantity: 1000,
  });

  assert.equal(result.status, "received");
  assert.equal(requestInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    customerName: "Demo User",
    customerEmail: "demo@example.test",
    destinationCountry: "Japan",
    productId: "green-coffee",
    quantity: 1000,
  });
});

test("tracking code is normalized before lookup", async () => {
  let requestedUrl = "";
  const client = createApiClient("http://localhost:4000", async (input) => {
    requestedUrl = String(input);
    return jsonResponse({ data: { status: "received", createdAt: "2026-10-07T00:00:00.000Z", productName: "Kopi Arabika hijau" } });
  });

  const status = await client.trackInquiry(" a1b2c3d4e5f60718293a4b5c ");
  assert.equal(requestedUrl, "http://localhost:4000/api/v1/inquiries/A1B2C3D4E5F60718293A4B5C");
  assert.equal(status.productName, "Kopi Arabika hijau");
});

test("rate limit responses are presented as actionable messages", async () => {
  const client = createApiClient("http://localhost:4000", async () => jsonResponse({ error: "rate_limit_exceeded" }, 429));
  await assert.rejects(client.getProducts(), /Batas permintaan tercapai/);
});

test("API URL rejects non-HTTP protocols and embedded credentials", () => {
  assert.throws(() => createApiClient("file:///tmp/api"), /http:\/\/ atau https:\/\//);
  assert.throws(() => createApiClient("https://user:pass@example.test"), /kredensial/);
});
