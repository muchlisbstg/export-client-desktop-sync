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
