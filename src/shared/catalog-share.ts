export type CatalogShareProduct = {
  name: string;
  category: string;
  origin: string;
  unit?: string;
};

export type CatalogShareOptions = {
  query?: string;
  category?: string;
  origin?: string;
  sortField?: string;
  sortDirection?: "asc" | "desc";
};

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

const sortLabels: Record<string, string> = {
  name: "Nama",
  category: "Kategori",
  origin: "Asal",
  unit: "Satuan",
};

/** Format only the supplied, already-filtered and sorted products for user-initiated sharing. */
export function formatCatalogShare(
  products: readonly CatalogShareProduct[],
  options: CatalogShareOptions = {},
): string {
  const lines = [`Katalog ekspor — ${products.length} produk`];
  const filters = [
    ["Pencarian", options.query],
    ["Kategori", options.category],
    ["Asal", options.origin],
  ] as const;
  const activeFilters = filters
    .map(([label, value]) => [label, clean(value)] as const)
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => `${label}: "${value}"`);

  if (activeFilters.length > 0) lines.push(`Filter: ${activeFilters.join("; ")}`);
  const sortLabel = options.sortField ? sortLabels[options.sortField] : undefined;
  if (sortLabel) lines.push(`Urutan: ${sortLabel} (${options.sortDirection === "desc" ? "Z–A" : "A–Z"})`);

  if (products.length === 0) {
    lines.push("", "Tidak ada produk yang cocok.");
  } else {
    lines.push("");
    products.forEach((product, index) => {
      const details = [clean(product.category), clean(product.origin), clean(product.unit) ? `per ${clean(product.unit)}` : ""].filter(Boolean);
      lines.push(`${index + 1}. ${clean(product.name)}${details.length ? ` — ${details.join(" · ")}` : ""}`);
    });
  }

  return lines.join("\n");
}
