import assert from "node:assert/strict";
import test from "node:test";
import { filterOutComparedProducts, formatComparisonCsv, formatComparisonShare, getComparisonFieldsToDisplay, getDifferingComparisonFields } from "../src/shared/catalog-compare";
import type { Product } from "../src/shared/api-types";

const products: Product[] = [
  { id: "coffee", name: "Coffee", category: "Kopi", origin: "Indonesia", unit: "kg" },
  { id: "cocoa", name: "Cocoa", category: "Kakao", origin: "Indonesia", unit: "kg" },
  { id: "spices", name: "Spices", category: "Rempah", origin: "Vietnam", unit: "box" },
];

test("comparison highlights only catalog attributes with differing values", () => {
  assert.deepEqual(getDifferingComparisonFields(products), ["category", "origin", "unit"]);
  assert.deepEqual(getDifferingComparisonFields(products.slice(0, 2)), ["category"]);
});

test("comparison shows no differences for identical values or fewer than two products", () => {
  const matching = [products[0], { ...products[0], id: "coffee-copy" }];
  assert.deepEqual(getDifferingComparisonFields(matching), []);
  assert.deepEqual(getDifferingComparisonFields([products[0]]), []);
  assert.deepEqual(getDifferingComparisonFields([]), []);
});

test("hiding compared products preserves remaining catalog order without mutating the input", () => {
  const input = products.map((product) => ({ ...product }));
  const snapshot = structuredClone(input);
  assert.deepEqual(filterOutComparedProducts(input, ["cocoa", "coffee"]).map((product) => product.id), ["spices"]);
  assert.deepEqual(filterOutComparedProducts(input, []), input);
  assert.deepEqual(input, snapshot);
});

test("difference detection does not mutate the product list", () => {
  const input = products.map((product) => ({ ...product }));
  const snapshot = structuredClone(input);
  getDifferingComparisonFields(input);
  assert.deepEqual(input, snapshot);
});


test("comparison can show all attributes or only attributes that differ", () => {
  assert.deepEqual(getComparisonFieldsToDisplay(products, false), ["category", "origin", "unit"]);
  assert.deepEqual(getComparisonFieldsToDisplay(products, true), ["category", "origin", "unit"]);
  assert.deepEqual(getComparisonFieldsToDisplay(products.slice(0, 2), true), ["category"]);
  const matching = [products[0], { ...products[0], id: "coffee-copy" }];
  assert.deepEqual(getComparisonFieldsToDisplay(matching, true), []);
  assert.deepEqual(getComparisonFieldsToDisplay(matching, false), ["category", "origin", "unit"]);
});

test("comparison summary includes only visible fields and marks differing values", () => {
  const summary = formatComparisonShare(products.slice(0, 2), ["category"], ["category"]);
  assert.equal(summary, "Perbandingan produk — 2 produk\n\nProduk: Coffee | Cocoa\nKategori: Kopi | Kakao (berbeda)");
  assert.doesNotMatch(summary, /Indonesia|kg|Asal|Satuan/);
});

test("comparison summary explains an empty difference-only view", () => {
  const matching = [products[0], { ...products[0], id: "coffee-copy" }];
  assert.match(formatComparisonShare(matching, [], []), /Tidak ada atribut yang berbeda/);
});

test("comparison CSV includes only visible attributes and preserves selected product order", () => {
  assert.equal(
    formatComparisonCsv(products.slice(0, 2), ["category"]),
    '"Detail","Coffee","Cocoa"\r\n"Kategori","Kopi","Kakao"',
  );
});

test("comparison CSV quotes special values and neutralizes spreadsheet formulas", () => {
  const unsafe = [
    { ...products[0], name: '=SUM(1,1)', category: 'Kopi "A"' },
    { ...products[1], name: "Cocoa", category: "=HYPERLINK(\"https://example.invalid\")" },
  ];
  assert.equal(
    formatComparisonCsv(unsafe, ["category"]),
    '"Detail","\t=SUM(1,1)","Cocoa"\r\n"Kategori","Kopi ""A""","\t=HYPERLINK(""https://example.invalid"")"',
  );
  assert.equal(formatComparisonCsv([products[0]], ["category"]), "");
});
