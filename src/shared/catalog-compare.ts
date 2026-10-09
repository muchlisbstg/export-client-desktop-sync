export const MAX_COMPARE_PRODUCTS = 3;
export type ComparisonField = "category" | "origin" | "unit";
const comparisonFields: readonly ComparisonField[] = ["category", "origin", "unit"];
type ComparisonAttributes = { category: string; origin: string; unit: string };

/** Toggle a product in a client-only comparison selection without mutating the input. */
export function toggleCompareSelection(
  comparedIds: readonly string[],
  productId: string,
  limit = MAX_COMPARE_PRODUCTS,
): string[] {
  const uniqueIds = [...new Set(comparedIds.filter(Boolean))];
  if (uniqueIds.includes(productId)) return uniqueIds.filter((id) => id !== productId);
  const safeLimit = Math.max(0, Math.floor(limit));
  if (!productId || uniqueIds.length >= safeLimit) return uniqueIds;
  return [...uniqueIds, productId];
}

/** Filter comparison-selected products from a displayed catalog without mutating it. */
export function filterOutComparedProducts<T extends { id: string }>(products: readonly T[], comparedIds: readonly string[]): T[] {
  const compared = new Set(comparedIds);
  return products.filter((product) => !compared.has(product.id));
}

/** Return catalog attributes whose values differ across the selected products. */
export function getDifferingComparisonFields<T extends ComparisonAttributes>(products: readonly T[]): ComparisonField[] {
  return comparisonFields.filter((field) => new Set(products.map((product) => product[field])).size > 1);
}


/** Choose all comparison attributes by default, or only attributes with differing values. */
export function getComparisonFieldsToDisplay<T extends ComparisonAttributes>(
  products: readonly T[],
  onlyDifferences: boolean,
): ComparisonField[] {
  return onlyDifferences ? getDifferingComparisonFields(products) : [...comparisonFields];
}

const comparisonShareLabels: Record<ComparisonField, string> = {
  category: "Kategori",
  origin: "Asal",
  unit: "Satuan",
};

function cleanComparisonShareValue(value: unknown, fallback = "—"): string {
  return String(value ?? "").replace(/\s+/gu, " ").trim() || fallback;
}

/** Format only the selected products and fields currently shown in the comparison. */
export function formatComparisonShare<T extends ComparisonAttributes & { name: string }>(
  products: readonly T[],
  visibleFields: readonly ComparisonField[],
  differingFields: readonly ComparisonField[],
): string {
  const lines = [`Perbandingan produk — ${products.length} produk`];
  if (products.length < 2) {
    lines.push("", "Pilih setidaknya dua produk untuk membandingkan.");
    return lines.join("\n");
  }

  lines.push("", `Produk: ${products.map((product) => cleanComparisonShareValue(product.name, "Tanpa nama")).join(" | ")}`);
  if (visibleFields.length === 0) {
    lines.push("", "Tidak ada atribut yang berbeda pada pilihan ini.");
    return lines.join("\n");
  }

  for (const field of visibleFields) {
    const values = products.map((product) => cleanComparisonShareValue(product[field]));
    lines.push(`${comparisonShareLabels[field]}: ${values.join(" | ")}${differingFields.includes(field) ? " (berbeda)" : ""}`);
  }
  return lines.join("\n");
}
