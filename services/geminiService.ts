
import { GoogleGenAI, Type } from "@google/genai";
import { ReceiptData } from "../types";

// Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const extractReceiptData = async (base64Image: string, mimeType: string): Promise<ReceiptData> => {
  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    Extract all relevant information from this receipt image. 
    Ensure the vendor name is correct, the total amount is precise, and try to list the individual line items if visible.
    Categorize the expense into one of: Food, Transport, Utilities, Entertainment, Shopping, Health, or Other.
    Return the data in a structured JSON format.
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
          date: { type: Type.STRING, description: "ISO 8601 format date if possible" },
          totalAmount: { type: Type.NUMBER },
          currency: { type: Type.STRING, description: "ISO currency code like JPY, USD" },
          taxAmount: { type: Type.NUMBER },
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
        required: ["vendorName", "totalAmount", "currency", "category"]
      },
    },
  });

  // The GenerateContentResponse object features a text property (not a method)
  const rawJson = response.text || "{}";
  const parsed = JSON.parse(rawJson);
  
  return {
    ...parsed,
    id: crypto.randomUUID(),
    rawImageUrl: `data:${mimeType};base64,${base64Image}`
  };
};
