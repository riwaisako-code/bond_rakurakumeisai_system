
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppView, ReceiptData, ReceiptItem } from './types';
import Header from './components/Header';
import ReceiptCard from './components/ReceiptCard';
import CameraView from './components/CameraView';
import { extractReceiptData } from './services/geminiService';
import { handleLogin, isAuthenticated, initGoogleServices, getAccessToken } from './services/authService';
import { uploadImageToDrive, saveToSpreadsheet } from './services/googleServices';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('history');
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await initGoogleServices();
        setIsLoggedIn(isAuthenticated());
      } catch (e) {
        console.error("Auth init failed", e);
      }
    };
    initAuth();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      await handleLogin();
      setIsLoggedIn(true);
    } catch (e) {
      console.error("Login failed", e);
      setError("Googleログインに失敗しました。");
    }
  };

  // Load sample data if empty
  useEffect(() => {
    const saved = localStorage.getItem('receipt_history');
    if (saved) {
      setReceipts(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('receipt_history', JSON.stringify(receipts));
  }, [receipts]);

  const processImage = async (base64String: string, mimeType: string) => {
    setIsScanning(true);
    setError(null);
    setView('scanning');

    try {
      const data = await extractReceiptData(base64String, mimeType);
      // We don't save to history immediately, we wait for user confirmation/edit?
      // Spec says: "3. Confirm/Edit/Approve".
      // So let's show it in details and ONLY save to history/sheets when approved.
      // But current logic saves to history immediately. I will keep it as is for history, but "Approved" state matters for Sheets.
      // Or better: temporary state for 'scanned' but not 'saved'.

      // Let's add it to receipts but maybe we need a status validation?
      // For now, following existing flow: Add to history, Open Details.
      setReceipts(prev => [data, ...prev]);
      setSelectedReceipt(data);
      setView('details');
    } catch (err) {
      console.error(err);
      setError('情報の抽出に失敗しました。もう一度お試しください。');
      setView('history');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      processImage(base64String, file.type);
    };
    reader.readAsDataURL(file);
    setShowOptions(false);
  };

  const handleCapture = (base64Image: string) => {
    processImage(base64Image, 'image/jpeg');
  };

  const triggerCamera = () => {
    setView('camera');
    setShowOptions(false);
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
    setShowOptions(false);
  };

  const handleBack = () => {
    setView('history');
    setSelectedReceipt(null);
  };

  const deleteReceipt = (id: string) => {
    setReceipts(prev => prev.filter(r => r.id !== id));
    handleBack();
  };

  const updateReceipt = (updated: ReceiptData) => {
    setReceipts(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSelectedReceipt(updated);
  };

  const handleSaveToGoogle = async () => {
    if (!selectedReceipt || !isLoggedIn) return;
    setIsSaving(true);
    setError(null);

    try {
      // 1. Upload Image to Drive
      const mimeType = selectedReceipt.rawImageUrl?.split(';')[0].split(':')[1] || 'image/jpeg';
      const base64Data = selectedReceipt.rawImageUrl?.split(',')[1] || '';
      const fileName = `${selectedReceipt.date}_${selectedReceipt.vendorName}_receipt`;

      const webViewLink = await uploadImageToDrive(base64Data, mimeType, fileName);

      // 2. Save Data to Sheets
      await saveToSpreadsheet(selectedReceipt, webViewLink);

      alert("保存しました！");
      handleBack();
    } catch (e) {
      console.error(e);
      setError("保存に失敗しました。権限やネットワークを確認してください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      {!isLoggedIn && (
        <div className="bg-blue-50 p-4 text-center">
          <p className="text-sm text-blue-800 mb-2">Google連携機能を利用するにはログインが必要です</p>
          <button
            onClick={handleGoogleLogin}
            className="bg-white text-blue-600 font-bold py-2 px-4 rounded-full border border-blue-200 shadow-sm text-sm"
          >
            Googleでログイン
          </button>
        </div>
      )}

      {view === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          onClose={() => setView('history')}
        />
      )}

      <main className="flex-grow max-w-2xl mx-auto w-full p-4 overflow-y-auto pb-32">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-sm font-medium animate-in fade-in slide-in-from-top-4 duration-300">
            {error}
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold text-slate-800">スキャン履歴</h2>
              <span className="text-sm text-slate-500">{receipts.length}件</span>
            </div>

            {receipts.length === 0 ? (
              <div className="text-center py-20 px-4 bg-white rounded-3xl border border-dashed border-slate-300">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
                </div>
                <p className="text-slate-500">まだ領収書がありません。<br />下のボタンから撮影または追加してください。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {receipts.map(receipt => (
                  <ReceiptCard
                    key={receipt.id}
                    receipt={receipt}
                    onClick={() => {
                      setSelectedReceipt(receipt);
                      setView('details');
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'scanning' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><path d="M12 18v-6" /><path d="M9 15h6" /></svg>
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-800 mb-2">スキャン中...</h2>
              <p className="text-slate-500">AIが内容を分析しています</p>
            </div>
          </div>
        )}

        {view === 'details' && selectedReceipt && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={handleBack}
                className="p-2 -ml-2 text-slate-600 active:bg-slate-100 rounded-full"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <h2 className="text-lg font-bold text-slate-800">領収書詳細（編集可能）</h2>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
              <div className="flex justify-center mb-4">
                <div className="w-32 h-44 rounded-xl bg-slate-50 overflow-hidden border border-slate-100 cursor-zoom-in active:scale-105 transition-transform">
                  <img
                    src={selectedReceipt.rawImageUrl}
                    alt="full receipt"
                    className="w-full h-full object-cover"
                    onClick={() => window.open(selectedReceipt.rawImageUrl, '_blank')}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">店舗名</label>
                  <input
                    type="text"
                    className="w-full text-xl font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 outline-none py-1"
                    value={selectedReceipt.vendorName}
                    onChange={(e) => updateReceipt({ ...selectedReceipt, vendorName: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">日付</label>
                    <input
                      type="date"
                      className="w-full text-slate-700 font-medium border-b border-slate-200 focus:border-blue-500 outline-none py-1"
                      value={selectedReceipt.date}
                      onChange={(e) => updateReceipt({ ...selectedReceipt, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">カテゴリー</label>
                    <select
                      className="w-full text-slate-700 font-medium border-b border-slate-200 focus:border-blue-500 outline-none py-1 bg-transparent"
                      value={selectedReceipt.category}
                      onChange={(e) => updateReceipt({ ...selectedReceipt, category: e.target.value })}
                    >
                      <option value="食費">食費</option>
                      <option value="交通費">交通費</option>
                      <option value="消耗品費">消耗品費</option>
                      <option value="接待交際費">接待交際費</option>
                      <option value="通信費">通信費</option>
                      <option value="水道光熱費">水道光熱費</option>
                      <option value="その他">その他</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">通貨</label>
                  <select
                    className="w-full text-slate-700 font-medium border-b border-slate-200 focus:border-blue-500 outline-none py-1 bg-transparent"
                    value={selectedReceipt.currency}
                    onChange={(e) => updateReceipt({ ...selectedReceipt, currency: e.target.value })}
                  >
                    <option value="JPY">JPY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">内訳</label>
                  <div className="mt-2 space-y-2">
                    {selectedReceipt.items.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center text-sm">
                        <input
                          className="flex-grow text-slate-600 border-b border-dashed border-slate-200 focus:border-blue-500 outline-none"
                          value={item.name}
                          onChange={(e) => {
                            const newItems = [...selectedReceipt.items];
                            newItems[idx].name = e.target.value;
                            updateReceipt({ ...selectedReceipt, items: newItems });
                          }}
                        />
                        <input
                          type="number"
                          className="w-20 text-right text-slate-800 font-medium border-b border-dashed border-slate-200 focus:border-blue-500 outline-none"
                          value={item.price}
                          onChange={(e) => {
                            const newItems = [...selectedReceipt.items];
                            newItems[idx].price = Number(e.target.value);
                            updateReceipt({ ...selectedReceipt, items: newItems });
                          }}
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => updateReceipt({ ...selectedReceipt, items: [...selectedReceipt.items, { name: '新規品目', price: 0 }] })}
                      className="text-xs text-blue-500 font-bold mt-2"
                    >
                      + 品目を追加
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">合計</label>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl font-black text-blue-600">
                        {selectedReceipt.currency === 'JPY' ? '¥' : selectedReceipt.currency}
                      </span>
                      <input
                        type="number"
                        className="text-2xl font-black text-blue-600 w-32 text-right outline-none bg-transparent"
                        value={selectedReceipt.totalAmount}
                        onChange={(e) => updateReceipt({ ...selectedReceipt, totalAmount: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => deleteReceipt(selectedReceipt.id)}
                className="flex-1 py-4 bg-white text-red-500 font-bold rounded-2xl border border-red-100 active:bg-red-50 transition-colors"
                disabled={isSaving}
              >
                削除
              </button>
              <button
                onClick={handleSaveToGoogle}
                disabled={!isLoggedIn || isSaving}
                className={`flex-[2] py-4 font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 ${!isLoggedIn ? 'bg-slate-300 text-white cursor-not-allowed' :
                    isSaving ? 'bg-slate-800 text-white cursor-wait' : 'bg-slate-900 text-white active:bg-slate-800'
                  }`}
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    保存中...
                  </>
                ) : (
                  '保存して戻る'
                )}
              </button>
            </div>
            {!isLoggedIn && (
              <p className="text-xs text-center text-red-500">※ 保存するにはGoogleログインが必要です</p>
            )}
          </div>
        )}
      </main>

      {/* Persistent Action Menu */}
      {view === 'history' && !isScanning && (
        <div className="fixed bottom-0 left-0 right-0 p-6 flex flex-col items-center safe-bottom pointer-events-none">
          {showOptions && (
            <div className="mb-4 flex flex-col gap-2 w-full max-w-sm pointer-events-auto animate-in slide-in-from-bottom-10 fade-in duration-200">
              <button
                onClick={triggerCamera}
                className="bg-white text-slate-800 font-bold py-4 px-6 rounded-2xl shadow-lg border border-slate-100 flex items-center gap-3 active:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                </div>
                <span>アプリで撮影</span>
              </button>
              <button
                onClick={triggerUpload}
                className="bg-white text-slate-800 font-bold py-4 px-6 rounded-2xl shadow-lg border border-slate-100 flex items-center gap-3 active:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                </div>
                <span>写真をアップロード</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setShowOptions(!showOptions)}
            className={`w-full max-w-sm pointer-events-auto text-white font-bold py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 ${showOptions ? 'bg-slate-800 scale-95' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}
          >
            {showOptions ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            )}
            {showOptions ? '閉じる' : '領収書を追加'}
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
        </div>
      )}
    </div>
  );
};

export default App;
