import type { Product } from "./api-types";

export function normalizeForSearch(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("id-ID")
    .trim();
}

export type CatalogSearchHighlightPart = { text: string; matched: boolean };

/** Split display text into matching and non-matching parts using the catalog's search rules. */
export function getCatalogSearchHighlightParts(value: string, query: string): CatalogSearchHighlightPart[] {
  const source = String(value ?? "");
  if (!source) return [];

  const terms = normalizeForSearch(query).split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return [{ text: source, matched: false }];

  const normalizedParts: string[] = [];
  const sourceStarts: number[] = [];
  const sourceEnds: number[] = [];
  let sourceOffset = 0;
  for (const character of source) {
    const unmarked = character.normalize("NFD").replace(/\p{M}/gu, "");
    if (unmarked.length === 0 && /\p{M}/u.test(character) && sourceEnds.length > 0) {
      sourceEnds[sourceEnds.length - 1] = sourceOffset + character.length;
    }
    for (const codePoint of unmarked) {
      normalizedParts.push(codePoint);
      for (let unit = 0; unit < codePoint.length; unit += 1) {
        sourceStarts.push(sourceOffset);
        sourceEnds.push(sourceOffset + character.length);
      }
    }
    sourceOffset += character.length;
  }

  const normalizedSource = normalizedParts.join("").toLocaleLowerCase("id-ID");
  if (normalizedSource.length !== sourceStarts.length) return [{ text: source, matched: false }];

  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let searchFrom = 0;
    while (searchFrom < normalizedSource.length) {
      const matchAt = normalizedSource.indexOf(term, searchFrom);
      if (matchAt < 0) break;
      const start = sourceStarts[matchAt];
      const end = sourceEnds[matchAt + term.length - 1];
      if (start !== undefined && end !== undefined) ranges.push([start, end]);
      searchFrom = matchAt + 1;
    }
  }

  if (ranges.length === 0) return [{ text: source, matched: false }];
  ranges.sort(([left], [right]) => left - right);
  const mergedRanges: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const previous = mergedRanges[mergedRanges.length - 1];
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else mergedRanges.push([start, end]);
  }

  const parts: CatalogSearchHighlightPart[] = [];
  let cursor = 0;
  for (const [start, end] of mergedRanges) {
    if (start > cursor) parts.push({ text: source.slice(cursor, start), matched: false });
    if (end > cursor) parts.push({ text: source.slice(Math.max(cursor, start), end), matched: true });
    cursor = Math.max(cursor, end);
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor), matched: false });
  return parts;
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
  const queryTerms = normalizeForSearch(query).split(/\s+/u).filter(Boolean);
  return products.filter((product) => {
    const matchesCategory = selectedCategory === "" || product.category === selectedCategory;
    const matchesOrigin = selectedOrigin === "" || product.origin === selectedOrigin;
    const matchesUnit = selectedUnit === "" || product.unit === selectedUnit;
    const searchable = normalizeForSearch([product.name, product.category, product.origin, product.unit].filter(Boolean).join(" "));
    const matchesQuery = queryTerms.every((term) => searchable.includes(term));
    return matchesCategory && matchesOrigin && matchesUnit && matchesQuery;
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
