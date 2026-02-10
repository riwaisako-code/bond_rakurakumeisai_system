
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
  items: ReceiptItem[];
  category: string;
  rawImageUrl?: string;
}

export type AppView = 'history' | 'scanning' | 'details' | 'camera';
