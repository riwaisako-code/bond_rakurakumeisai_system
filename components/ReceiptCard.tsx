
import React from 'react';
import { ReceiptData } from '../types';

interface ReceiptCardProps {
  receipt: ReceiptData;
  onClick: () => void;
}

const ReceiptCard: React.FC<ReceiptCardProps> = ({ receipt, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.98] transition-transform flex items-center gap-4 cursor-pointer"
    >
      <div className="w-14 h-14 rounded-xl bg-slate-50 flex-shrink-0 overflow-hidden border border-slate-100 flex items-center justify-center">
        {receipt.rawImageUrl ? (
          <img src={receipt.rawImageUrl} alt="receipt" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl">📄</span>
        )}
      </div>
      <div className="flex-grow min-w-0">
        <h3 className="font-bold text-slate-800 truncate">{receipt.vendorName}</h3>
        <p className="text-sm text-slate-500">{receipt.date || '日付不明'}</p>
        <span className="inline-block px-2 py-0.5 mt-1 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">
          {receipt.category}
        </span>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-blue-600 text-lg">
          {receipt.currency === 'JPY' ? '¥' : receipt.currency}
          {receipt.totalAmount.toLocaleString()}
        </p>
      </div>
    </div>
  );
};

export default ReceiptCard;
