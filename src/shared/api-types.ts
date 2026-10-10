export type Product = {
  id: string;
  name: string;
  category: string;
  origin: string;
  unit: string;
};

export type InquiryStatus = {
  status: string;
  createdAt: string;
  productName: string;
};

export type CreateInquiryInput = {
  customerName: string;
  customerEmail: string;
  destinationCountry: string;
  productId: string;
  quantity: number;
};

export type CreateInquiryResult = {
  trackingCode: string;
  status: string;
  createdAt: string;
};

export type SyncStatus = {
  enabled: boolean;
  peerCount: number;
  pendingDeliveries: number;
  retryingDeliveries: number;
  conflicts: number;
};

export type ApiHealth = {
  status: "ok";
  nodeId: string;
  syncEnabled: boolean;
  syncStatus: SyncStatus;
};
