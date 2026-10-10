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

export type ActiveCatalogFilter = { key: "search" | "category" | "origin" | "unit"; value: string };

/** Describe active filters in a stable order for the removable filter summary. */
export function getActiveCatalogFilters(query: string, category: string, origin: string, unit = ""): ActiveCatalogFilter[] {
  const filters: ActiveCatalogFilter[] = [];
  const trimmedQuery = query.trim();
  if (trimmedQuery) filters.push({ key: "search", value: trimmedQuery });
  if (category) filters.push({ key: "category", value: category });
  if (origin) filters.push({ key: "origin", value: origin });
  if (unit) filters.push({ key: "unit", value: unit });
  return filters;
}

export function getCategories(products: readonly Product[]): string[] {
  const unique = new Set(products.map((product) => product.category).filter(Boolean));
  return [...unique].sort((a, b) => a.localeCompare(b, "id-ID", { sensitivity: "base" }));
}

export function getOrigins(products: readonly Product[]): string[] {
  const unique = new Set(products.map((product) => product.origin).filter(Boolean));
  return [...unique].sort((a, b) => a.localeCompare(b, "id-ID", { sensitivity: "base" }));
}

export function getUnits(products: readonly Product[]): string[] {
  const unique = new Set(products.map((product) => product.unit).filter((unit): unit is string => Boolean(unit)));
  return [...unique].sort((a, b) => a.localeCompare(b, "id-ID", { sensitivity: "base" }));
}

export type CatalogFacetField = "category" | "origin" | "unit";

/** Count non-empty facet values in the supplied, already-filtered catalog subset. */
export function getFacetCounts<T extends Pick<Product, CatalogFacetField>>(
  products: readonly T[],
  field: CatalogFacetField,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const product of products) {
    const value = product[field];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function filterProducts(products: readonly Product[], query = "", selectedCategory = "", selectedOrigin = "", selectedUnit = ""): Product[] {
  const normalizedQuery = normalizeForSearch(query);
  return products.filter((product) => {
    const matchesCategory = selectedCategory === "" || product.category === selectedCategory;
    const matchesOrigin = selectedOrigin === "" || product.origin === selectedOrigin;
    const matchesUnit = selectedUnit === "" || product.unit === selectedUnit;
    const searchable = normalizeForSearch(`${product.name} ${product.category} ${product.origin}`);
    return matchesCategory && matchesOrigin && matchesUnit && (!normalizedQuery || searchable.includes(normalizedQuery));
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
