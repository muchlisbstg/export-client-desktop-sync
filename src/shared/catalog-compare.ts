export const MAX_COMPARE_PRODUCTS = 3;

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
