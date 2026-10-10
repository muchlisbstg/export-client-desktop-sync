import assert from "node:assert/strict";
import test from "node:test";
import { formatCatalogCsv } from "../src/shared/catalog-csv";
import type { Product } from "../src/shared/api-types";

const products: Product[] = [
  { id: "coffee", name: "Coffee", category: "Kopi", origin: "Indonesia", unit: "kg" },
  { id: "cocoa", name: "Cocoa", category: "Kakao", origin: "Indonesia", unit: "kg" },
];

test("catalog CSV includes the displayed products and preserves their order", () => {
  assert.equal(
    formatCatalogCsv(products),
    '"Nama produk","Kategori","Asal","Satuan"\r\n"Coffee","Kopi","Indonesia","kg"\r\n"Cocoa","Kakao","Indonesia","kg"',
  );
});

test("catalog CSV escapes quotes, commas, newlines, and spreadsheet formulas", () => {
  const special: Product[] = [{
    id: "special",
    name: '=HYPERLINK("https://example.invalid")',
    category: 'Kopi, "premium"',
    origin: "Line 1\nLine 2",
    unit: "kg",
  }];
  assert.equal(
    formatCatalogCsv(special),
    '"Nama produk","Kategori","Asal","Satuan"\r\n"\t=HYPERLINK(""https://example.invalid"")","Kopi, ""premium""","Line 1\nLine 2","kg"',
  );
});

test("catalog CSV is empty when there are no displayed products and never mutates input", () => {
  const input = products.map((product) => ({ ...product }));
  const snapshot = structuredClone(input);
  assert.equal(formatCatalogCsv([]), "");
  formatCatalogCsv(input);
  assert.deepEqual(input, snapshot);
});
