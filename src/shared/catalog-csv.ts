export type CatalogCsvProduct = {
  name: string;
  category: string;
  origin: string;
  unit: string;
};

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  const safeText = /^[\t\r\n ]*[=+\-@]/u.test(text) ? `\t${text}` : text;
  return `"${safeText.replace(/"/gu, '""')}"`;
}

/** Format the catalog rows currently shown as spreadsheet-safe RFC 4180 CSV. */
export function formatCatalogCsv<T extends CatalogCsvProduct>(products: readonly T[]): string {
  if (products.length === 0) return "";

  const rows = [
    ["Nama produk", "Kategori", "Asal", "Satuan"],
    ...products.map((product) => [product.name, product.category, product.origin, product.unit]),
  ];
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}
