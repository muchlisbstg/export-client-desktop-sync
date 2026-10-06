import type {
  ApiHealth,
  CreateInquiryInput,
  CreateInquiryResult,
  InquiryStatus,
  Product,
} from "./api-types";

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Masukkan alamat API yang valid, misalnya http://localhost:4000.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Alamat API harus menggunakan http:// atau https://.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Alamat API tidak boleh berisi kredensial, query, atau fragmen.");
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}

function getErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" ? error : undefined;
}

async function readJson<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  const errorCode = getErrorCode(payload);
  if (!response.ok) {
    if (response.status === 429 || errorCode === "rate_limit_exceeded") {
      throw new Error("Batas permintaan tercapai. Coba lagi beberapa menit lagi.");
    }
    if (response.status === 404 && errorCode === "inquiry_not_found") {
      throw new Error("Permintaan tidak ditemukan. Periksa kode pelacakan.");
    }
    if (response.status === 404 && errorCode === "product_not_found") {
      throw new Error("Produk ini sudah tidak tersedia.");
    }
    if (response.status === 400) throw new Error("Periksa kembali data yang dimasukkan.");
    throw new Error("API tidak dapat memproses permintaan. Periksa server dan alamat API.");
  }

  if (payload === undefined || payload === null) {
    throw new Error("API mengirim respons yang tidak valid.");
  }
  return payload as T;
}

export function createApiClient(apiBaseUrl: string, fetcher: typeof fetch = fetch) {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error("Tidak dapat terhubung ke server. Periksa koneksi dan alamat API.");
    }
    return readJson<T>(response);
  }

  return {
    async getHealth(): Promise<ApiHealth> {
      const result = await requestJson<ApiHealth>("/health");
      if (result.status !== "ok") throw new Error("API belum siap.");
      return result;
    },

    async getProducts(): Promise<Product[]> {
      const result = await requestJson<{ data: Product[] }>("/api/v1/products");
      if (!Array.isArray(result.data)) throw new Error("API mengirim katalog dengan format yang tidak valid.");
      return result.data;
    },

    async createInquiry(input: CreateInquiryInput): Promise<CreateInquiryResult> {
      const result = await requestJson<CreateInquiryResult>("/api/v1/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (typeof result.trackingCode !== "string") throw new Error("API tidak mengembalikan kode pelacakan.");
      return result;
    },

    async trackInquiry(code: string): Promise<InquiryStatus> {
      const encodedCode = encodeURIComponent(code.trim().toUpperCase());
      const result = await requestJson<{ data: InquiryStatus }>(`/api/v1/inquiries/${encodedCode}`);
      if (!result.data || typeof result.data.productName !== "string") {
        throw new Error("API mengirim status pelacakan dengan format yang tidak valid.");
      }
      return result.data;
    },
  };
}
