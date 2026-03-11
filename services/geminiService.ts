
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
    - 費目（category）: 食費・交通費・消耗品費・接待交際費・通信費・水道光熱費・その他 のいずれかに分類すること。
    - 明細（items）: 読み取れる場合のみ、商品名と単価を列挙すること。
    - 消費税（taxAmount）: レシートに記載された消費税額（8%・10%の合算で可）を数値で読み取ること。記載がない場合は0とすること。
    - 税抜き金額（preTaxAmount）: レシートに「税抜き」「小計（税抜）」「小計」など税抜き金額が記載されている場合はその数値を読み取ること。記載がない場合は0とすること。
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
          taxAmount: { type: Type.NUMBER, description: "消費税額。記載なけれで0" },
          preTaxAmount: { type: Type.NUMBER, description: "税抜き金額。記載なけれで0" },
          category: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                quantity: { type: Type.NUMBER },
              },
              required: ["name", "price"]
            }
          }
        },
        required: ["vendorName", "date", "totalAmount", "currency", "category"]
      },
    },
  });

  // The GenerateContentResponse object features a text property (not a method)
  const rawJson = response.text || "{}";
  const parsed = JSON.parse(rawJson);

  const preTaxItem = parsed.preTaxAmount ? [{ name: '買物小計（税抜き）', price: parsed.preTaxAmount }] : [];
  const taxItem = parsed.taxAmount ? [{ name: '消費税', price: parsed.taxAmount }] : [];


  return {
    ...parsed,
    id: crypto.randomUUID(),
    rawImageUrl: `data:${mimeType};base64,${base64Image}`,
    items: [...(parsed.items || []), ...preTaxItem, ...taxItem],  // 商品明細 → 税抜き小計 → 消費税 の順で追加
  };
};
