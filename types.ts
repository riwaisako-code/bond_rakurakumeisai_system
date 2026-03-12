
export interface ReceiptItem {
  name: string;
  price: number;
  quantity?: number;
}

export interface ReceiptData {
  id: string;
  vendorName: string;
  date: string;
  totalAmount: number;
  currency: string;
  taxAmount?: number;
  tax8Amount?: number;
  tax10Amount?: number;
  total8Amount?: number;
  total10Amount?: number;
  preTaxAmount?: number;
  items: ReceiptItem[];
  category: string;
  invoice?: boolean;
  rawImageUrl?: string;
}

export type AppView = 'history' | 'scanning' | 'details' | 'camera';
