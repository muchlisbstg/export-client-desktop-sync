import type { Product } from "./api-types";

export function normalizeForSearch(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("id-ID")
    .trim();
}

export function getCategories(products: readonly Product[]): string[] {
  const unique = new Set(products.map((product) => product.category).filter(Boolean));
  return [...unique].sort((a, b) => a.localeCompare(b, "id-ID", { sensitivity: "base" }));
}

export function filterProducts(products: readonly Product[], query = "", selectedCategory = ""): Product[] {
  const normalizedQuery = normalizeForSearch(query);
  return products.filter((product) => {
    const matchesCategory = selectedCategory === "" || product.category === selectedCategory;
    const searchable = normalizeForSearch(`${product.name} ${product.category} ${product.origin}`);
    return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}
