export type InquiryFormValues = {
  customerName: string;
  customerEmail: string;
  destinationCountry: string;
  productId: string;
  quantity: string;
};

export type InquiryField = keyof InquiryFormValues;
export type InquiryFieldErrors = Partial<Record<InquiryField, string>>;

const emailPattern = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export function validateInquiryField(field: InquiryField, value: string): string {
  const trimmed = value.trim();
  switch (field) {
    case "customerName":
      if (trimmed.length < 2) return "Nama wajib diisi minimal 2 karakter.";
      if (trimmed.length > 120) return "Nama maksimal 120 karakter.";
      return "";
    case "customerEmail":
      if (!trimmed) return "Email wajib diisi.";
      if (trimmed.length > 254) return "Email maksimal 254 karakter.";
      if (!emailPattern.test(trimmed)) return "Masukkan alamat email yang valid.";
      return "";
    case "destinationCountry":
      if (trimmed.length < 2) return "Negara tujuan wajib diisi minimal 2 karakter.";
      if (trimmed.length > 80) return "Negara tujuan maksimal 80 karakter.";
      return "";
    case "productId":
      if (!trimmed) return "Pilih produk.";
      if (trimmed.length > 80) return "Pilihan produk tidak valid.";
      return "";
    case "quantity": {
      if (!trimmed) return "Jumlah wajib diisi.";
      const quantity = Number(trimmed);
      if (!Number.isFinite(quantity)) return "Masukkan jumlah yang valid.";
      if (quantity <= 0) return "Jumlah harus lebih dari 0.";
      if (quantity > 1_000_000) return "Jumlah maksimal 1.000.000.";
      return "";
    }
  }
}

export function validateInquiryForm(values: InquiryFormValues): InquiryFieldErrors {
  const errors: InquiryFieldErrors = {};
  for (const field of Object.keys(values) as InquiryField[]) {
    const message = validateInquiryField(field, values[field]);
    if (message) errors[field] = message;
  }
  return errors;
}
