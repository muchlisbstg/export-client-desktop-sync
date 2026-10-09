import type { Product } from "./api-types";

export function normalizeForSearch(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("id-ID")
    .trim();
}

export type CatalogSortField = "default" | "name" | "category" | "origin" | "unit";
export type CatalogSortDirection = "asc" | "desc";

export const catalogSortOptions: ReadonlyArray<{ field: CatalogSortField; label: string }> = [
  { field: "default", label: "Urutan awal" },
  { field: "name", label: "Nama" },
  { field: "category", label: "Kategori" },
  { field: "origin", label: "Asal" },
  { field: "unit", label: "Satuan" },
];

export function getCategories(products: readonly Product[]): string[] {
  const unique = new Set(products.map((product) => product.category).filter(Boolean));
  return [...unique].sort((a, b) => a.localeCompare(b, "id-ID", { sensitivity: "base" }));
}

export function getOrigins(products: readonly Product[]): string[] {
  const unique = new Set(products.map((product) => product.origin).filter(Boolean));
  return [...unique].sort((a, b) => a.localeCompare(b, "id-ID", { sensitivity: "base" }));
}

export function filterProducts(products: readonly Product[], query = "", selectedCategory = "", selectedOrigin = ""): Product[] {
  const normalizedQuery = normalizeForSearch(query);
  return products.filter((product) => {
    const matchesCategory = selectedCategory === "" || product.category === selectedCategory;
    const matchesOrigin = selectedOrigin === "" || product.origin === selectedOrigin;
    const searchable = normalizeForSearch(`${product.name} ${product.category} ${product.origin}`);
    return matchesCategory && matchesOrigin && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}

/** Sort a copy of the currently loaded catalog; equal values retain their input order. */
export function sortProducts<T extends Product>(
  products: readonly T[],
  field: CatalogSortField = "default",
  direction: CatalogSortDirection = "asc",
): T[] {
  if (field === "default") return [...products];

  const collator = new Intl.Collator("id-ID", { sensitivity: "base", numeric: true });
  const multiplier = direction === "asc" ? 1 : -1;
  return products
    .map((product, index) => ({ product, index }))
    .sort((a, b) => {
      const result = collator.compare(String(a.product[field] ?? "").trim(), String(b.product[field] ?? "").trim());
      return result === 0 ? a.index - b.index : result * multiplier;
    })
    .map(({ product }) => product);
}
