
import { GoogleGenAI, Type } from "@google/genai";
import { ReceiptData } from "../types";

// Always use const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY});
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
  console.error("Gemini API Key is missing or invalid. Please check your .env.local file.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

export const extractReceiptData = async (base64Image: string, mimeType: string): Promise<ReceiptData> => {
  const model = 'gemini-2.0-flash';

  const prompt = `
    あなたは領収書・レシートの情報を抽出するAIアシスタントです。
    この領収書画像から以下の情報を正確に読み取ってください。

    【重要】
    - 日付（date）: 必ず読み取ること。和暦（令和・平成等）や「YYYY年MM月DD日」形式はすべて「YYYY-MM-DD」形式に変換すること。日付が読み取れない場合は空文字（""）を返すこと。
    - 店舗名（vendorName）: レシートに記載の店舗・会社名を正確に読み取ること。
    - 合計金額（totalAmount）: 「合計」「小計」「税込合計」「お会計」「ご請求額」など支払い総額を示す数値を読み取ること。¥や円の記号・カンマは除いた純粋な数値で返すこと。
    - 通貨（currency）: 日本のレシートは「JPY」とすること。
    - 費目（category）: 以下のリストの中から、店舗名および各商品の品目（items）の内容を精査して、最も適切なものを一つだけ選ぶこと。
      【カテゴリーリスト】
      仕入, 消耗品費, 福利厚生費, 旅費交通費, 交際費, 交際費(非), 荷造運賃, 通信費, 販売促進費, 広告費, 水道光熱費, 手数料, 地代家賃, 給料, 諸会費, 雑貨, 会合費, 租税公課(印紙代), 租税公課(行政手数料), 租税公課(その他), 車輌費, 車輛費(非), 軽減税率, 未払法人税等, 給食費, 衛生保険費, 保育材料費, 業務委託費, その他, 本部へ
      ※ リストにないカテゴリーは出力しないこと。判断が難しい場合は「その他」とすること。
    - 明細（items）: 読み取れる場合のみ、商品名・単価・数量を列挙すること。
      【税率判定ルール（taxRate）】
      各商品について、日本の消費税軽減税率制度に基づき taxRate を 8 または 10 に設定すること。
      ・taxRate = 8（軽減税率）: 食品・飲料（酒類・外食を除く）、定期購読の新聞
        例：米、パン、牛乳、野菜、果物、お菓子、清涼飲料水、弁当（テイクアウト）、冷凍食品 など
      ・taxRate = 10（標準税率）: 酒類、外食（イートイン）、衣類、文具、日用品、医薬品、電子機器 など
      ※ 判断が難しい場合は 10 とすること。
    - 消費税総額（taxAmount）: レシートに記載された消費税額の総額。記載がなければ0。
    - 8%対象額（target8Amount）: レシートに記載された「8%対象」の金額。税込・税抜問わず印字されている数値をそのまま抽出すること。記載がなければ0。
    - 8%消費税額（tax8Amount）: レシートに記載された「8%消費税」の金額。記載がなければ0。
    - 8%は内税か？（is8TaxIncluded）: target8Amountが「税込（内税）」の金額であれば true、「税抜（外税）」の金額であれば false を設定すること。
    - 10%対象額（target10Amount）: レシートに記載された「10%対象」の金額。税込・税抜問わず印字されている数値をそのまま抽出すること。記載がなければ0。
    - 10%消費税額（tax10Amount）: レシートに記載された「10%消費税」の金額。記載がなければ0。
    - 10%は内税か？（is10TaxIncluded）: target10Amountが「税込（内税）」の金額であれば true、「税抜（外税）」の金額であれば false を設定すること。
    - 税抜き金額（preTaxAmount）: レシートに「税抜き」「小計（税抜）」など税抜き総額が記載されている場合はその数値を読み取ること。記載がなければ0。
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          vendorName: { type: Type.STRING },
          date: { type: Type.STRING, description: "YYYY-MM-DD形式の日付" },
          totalAmount: { type: Type.NUMBER, description: "支払い合計金額（数値のみ、記号・カンマなし）" },
          currency: { type: Type.STRING, description: "JPY, USD等のISO通貨コード" },
          taxAmount: { type: Type.NUMBER, description: "消費税額の総額" },
          target8Amount: { type: Type.NUMBER, description: "8%対象金額（印字そのまま）" },
          tax8Amount: { type: Type.NUMBER, description: "8%消費税額" },
          is8TaxIncluded: { type: Type.BOOLEAN, description: "target8Amountが税込ならtrue、税抜ならfalse" },
          target10Amount: { type: Type.NUMBER, description: "10%対象金額（印字そのまま）" },
          tax10Amount: { type: Type.NUMBER, description: "10%消費税額" },
          is10TaxIncluded: { type: Type.BOOLEAN, description: "target10Amountが税込ならtrue、税抜ならfalse" },
          preTaxAmount: { type: Type.NUMBER, description: "税抜き金額" },
          category: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                quantity: { type: Type.NUMBER },
                taxRate: { type: Type.NUMBER, description: "消費税率: 8（軽減税率：食品・飲料等）または 10（標準税率）" },
              },
              required: ["name", "price", "taxRate"]
            }
          }
        },
        required: ["vendorName", "date", "totalAmount", "currency", "category"]
      },
    },
  });

  const rawJson = response.text || "{}";
  const parsed = JSON.parse(rawJson);

  // --- アプリケーション側での確実な税込計算ロジック ---
  let total8Amount = 0;
  let total10Amount = 0;

  const t8 = parsed.target8Amount || 0;
  const tax8 = parsed.tax8Amount || 0;
  if (t8 > 0) {
    total8Amount = parsed.is8TaxIncluded ? t8 : (t8 + tax8);
  }

  const t10 = parsed.target10Amount || 0;
  const tax10 = parsed.tax10Amount || 0;
  if (t10 > 0) {
    total10Amount = parsed.is10TaxIncluded ? t10 : (t10 + tax10);
  }

  // 万が一レシートに一切の税率記載がない場合（Amazonなど）の最終フェイルセーフ
  // 全商品の合計金額から逆算・推計する既存の強力なロジックを流用
  const isInvalidTotal = (total8Amount === 0 && total10Amount === 0);

  if (isInvalidTotal && parsed.items?.length > 0) {
    const itemsTotal = parsed.items.reduce((sum: number, item: any) => sum + (item.price || 0), 0);
    const isTaxExcluded = parsed.preTaxAmount && Math.abs(itemsTotal - parsed.preTaxAmount) < 5;

    for (const item of parsed.items) {
      let itemPrice = item.price || 0;
      if (isTaxExcluded) {
        itemPrice = Math.floor(itemPrice * (item.taxRate === 8 ? 1.08 : 1.10));
      }
      if (item.taxRate === 8) {
        total8Amount += itemPrice;
      } else {
        total10Amount += itemPrice;
      }
    }
  }

  // パース結果（AIの生データ）に新しく計算した税込合計を上書きして返す
  parsed.total8Amount = total8Amount;
  parsed.total10Amount = total10Amount;

  const preTaxItem = parsed.preTaxAmount ? [{ name: '買物小計（税抜き）', price: parsed.preTaxAmount }] : [];
  const taxItem = parsed.taxAmount ? [{ name: '消費税', price: parsed.taxAmount }] : [];

  return {
    ...parsed,
    total8Amount,
    total10Amount,
    id: crypto.randomUUID(),
    rawImageUrl: `data:${mimeType};base64,${base64Image}`,
    items: [...(parsed.items || []), ...preTaxItem, ...taxItem],
  };
};
