import assert from "node:assert/strict";
import test from "node:test";
import { formatCatalogShare } from "../src/shared/catalog-share";
import type { Product } from "../src/shared/api-types";

const products: Product[] = [
  { id: "coffee", name: "Kopi Gayo", category: "Biji kopi", origin: "Aceh", unit: "kg" },
  { id: "cocoa", name: "Kakao", category: "Kakao", origin: "Sulawesi", unit: "kg" },
];

test("formats the supplied result order and active filter/sort context", () => {
  assert.equal(formatCatalogShare([products[1], products[0]], {
    query: " kopi ", category: "Biji kopi", origin: "Aceh", unit: "kg", sortField: "name", sortDirection: "desc",
  }), [
    "Katalog ekspor — 2 produk",
    'Filter: Pencarian: "kopi"; Kategori: "Biji kopi"; Asal: "Aceh"; Satuan: "kg"',
    "Urutan: Nama (Z–A)",
    "",
    "1. Kakao — Kakao · Sulawesi · per kg",
    "2. Kopi Gayo — Biji kopi · Aceh · per kg",
  ].join("\n"));
});

test("cleans whitespace and handles empty results without mutating inputs", () => {
  const input: Product[] = [{ id: "coffee", name: "  Kopi\n  Gayo ", category: "", origin: "Aceh", unit: "" }];
  const snapshot = structuredClone(input);
  assert.equal(formatCatalogShare(input, { query: "\n kopi   " }), [
    "Katalog ekspor — 1 produk",
    'Filter: Pencarian: "kopi"',
    "",
    "1. Kopi Gayo — Aceh",
  ].join("\n"));
  assert.equal(formatCatalogShare([]), "Katalog ekspor — 0 produk\n\nTidak ada produk yang cocok.");
  assert.deepEqual(input, snapshot);
});
