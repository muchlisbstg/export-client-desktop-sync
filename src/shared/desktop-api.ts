import type {
  ApiHealth,
  CreateInquiryInput,
  CreateInquiryResult,
  InquiryStatus,
  Product,
} from "./api-types";

export type DesktopApi = {
  getHealth(baseUrl: string): Promise<ApiHealth>;
  getProducts(baseUrl: string): Promise<Product[]>;
  createInquiry(baseUrl: string, input: CreateInquiryInput): Promise<CreateInquiryResult>;
  trackInquiry(baseUrl: string, code: string): Promise<InquiryStatus>;
  copyText(value: string): Promise<boolean>;
  saveComparisonCsv(value: string): Promise<boolean>;
  saveCatalogCsv(value: string): Promise<boolean>;
};

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
