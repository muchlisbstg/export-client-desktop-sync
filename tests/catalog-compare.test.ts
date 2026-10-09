import assert from "node:assert/strict";
import test from "node:test";
import { getDifferingComparisonFields } from "../src/shared/catalog-compare";
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

test("difference detection does not mutate the product list", () => {
  const input = products.map((product) => ({ ...product }));
  const snapshot = structuredClone(input);
  getDifferingComparisonFields(input);
  assert.deepEqual(input, snapshot);
});
