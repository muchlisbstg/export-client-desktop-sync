import assert from "node:assert/strict";
import test from "node:test";
import { filterProducts, getCategories, sortProducts } from "../src/shared/catalog-filter";
import type { Product } from "../src/shared/api-types";

const products: Product[] = [
  { id: "coffee", name: "Kopi Arabika hijau", category: "Kopi", origin: "Indonesia", unit: "kg" },
  { id: "spices", name: "Rempah kering pilihan", category: "Rempah", origin: "Vietnam", unit: "kg" },
  { id: "cocoa", name: "Biji kakao fermentasi", category: "Kakao", origin: "Indonesia", unit: "kg" },
];

const ids = (items: Product[]) => items.map((item) => item.id);

test("pencarian mencocokkan nama, kategori, dan asal", () => {
  assert.deepEqual(ids(filterProducts(products, "arabika")), ["coffee"]);
  assert.deepEqual(ids(filterProducts(products, "rempah")), ["spices"]);
  assert.deepEqual(ids(filterProducts(products, "vietnam")), ["spices"]);
});

test("pencarian mengabaikan kapitalisasi dan trim", () => {
  assert.deepEqual(ids(filterProducts(products, "  KOPI  ")), ["coffee"]);
});

test("pencarian menormalkan aksen Unicode", () => {
  const accented = [{ ...products[0], name: "Café robusta" }];
  assert.deepEqual(ids(filterProducts(accented, "cafe")), ["coffee"]);
});

test("kategori unik dinamis dan terurut locale Indonesia", () => {
  const dynamic = [...products, { ...products[0], id: "tea", category: "Teh" }];
  assert.deepEqual(getCategories(dynamic), ["Kakao", "Kopi", "Rempah", "Teh"]);
});

test("kategori API bernama all tetap menjadi kategori nyata yang bisa dipilih", () => {
  const dynamic = [...products, { ...products[0], id: "literal-all", category: "all" }];
  assert.deepEqual(ids(filterProducts(dynamic, "", "all")), ["literal-all"]);
});

test("nilai kategori API berbeda aksen tetap dapat dipilih terpisah", () => {
  const dynamic = [
    { ...products[0], id: "accented", category: "Café" },
    { ...products[1], id: "plain", category: "Cafe" },
  ];
  assert.equal(getCategories(dynamic).length, 2);
  assert.deepEqual(ids(filterProducts(dynamic, "", "Café")), ["accented"]);
});

test("pencarian dan kategori memakai AND", () => {
  assert.deepEqual(ids(filterProducts(products, "biji", "Kakao")), ["cocoa"]);
  assert.deepEqual(ids(filterProducts(products, "biji", "Kopi")), []);
});

test("filter kosong mengembalikan semua produk", () => {
  assert.deepEqual(ids(filterProducts(products)), ids(products));
});

test("filter tidak mengubah array sumber maupun item", () => {
  const source = products.map((product) => ({ ...product }));
  const snapshot = structuredClone(source);
  filterProducts(source, "kakao", "Kakao");
  assert.deepEqual(source, snapshot);
});

const sortableProducts: Product[] = [
  { id: "zulu", name: "Zebra", category: "Rempah", origin: "Zambia", unit: "kg" },
  { id: "name-two-a", name: "Produk 2", category: "Minuman", origin: "Bali", unit: "bag" },
  { id: "name-two-b", name: "Produk 2", category: "Minuman", origin: "Bali", unit: "box" },
  { id: "name-ten", name: "Produk 10", category: "Bahan", origin: "Jakarta", unit: "g" },
];

test("local sorting supports each existing catalog field with Indonesian natural ordering", () => {
  assert.deepEqual(ids(sortProducts(sortableProducts, "name")), ["name-two-a", "name-two-b", "name-ten", "zulu"]);
  assert.deepEqual(ids(sortProducts(sortableProducts, "category")), ["name-ten", "name-two-a", "name-two-b", "zulu"]);
  assert.deepEqual(ids(sortProducts(sortableProducts, "origin")), ["name-two-a", "name-two-b", "name-ten", "zulu"]);
  assert.deepEqual(ids(sortProducts(sortableProducts, "unit")), ["name-two-a", "name-two-b", "name-ten", "zulu"]);
});

test("descending sorting is stable for ties and sorting a filtered list leaves source order unchanged", () => {
  const originalOrder = ids(sortableProducts);
  assert.deepEqual(ids(sortProducts(sortableProducts, "name", "desc")), ["zulu", "name-ten", "name-two-a", "name-two-b"]);
  const filteredSorted = sortProducts(filterProducts(sortableProducts, "produk"), "name", "desc");
  assert.deepEqual(ids(filteredSorted), ["name-ten", "name-two-a", "name-two-b"]);
  assert.deepEqual(ids(sortProducts(sortableProducts, "default")), originalOrder);
  assert.notStrictEqual(sortProducts(sortableProducts, "default"), sortableProducts);
  assert.deepEqual(ids(sortableProducts), originalOrder);
});
