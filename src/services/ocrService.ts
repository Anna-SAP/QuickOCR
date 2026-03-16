import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface OcrResult {
  text: string;
  language: string;
  languageCode: string;
}

export async function extractTextFromImage(base64Image: string, mimeType: string): Promise<OcrResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: "Extract all text from this image. Preserve the original layout and formatting as much as possible. Also detect the primary language of the text.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: {
              type: Type.STRING,
              description: "The extracted text. Preserve original layout.",
            },
            language: {
              type: Type.STRING,
              description: "The detected primary language (e.g., 'English', 'Simplified Chinese', 'Japanese').",
            },
            languageCode: {
              type: Type.STRING,
              description: "The ISO 639-1 language code (e.g., 'en', 'zh', 'ja').",
            },
          },
          required: ["text", "language", "languageCode"],
        },
      },
    });

    if (!response.text) {
      throw new Error("Empty response from model");
    }

    const result = JSON.parse(response.text) as OcrResult;
    return result;
  } catch (error) {
    console.error("Error extracting text:", error);
    throw new Error("Failed to extract text from image.");
  }
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate the following text to ${targetLanguage}. Only return the translated text, no other comments or markdown formatting.\n\nText:\n${text}`,
    });
    return response.text || "";
  } catch (error) {
    console.error("Error translating text:", error);
    throw new Error("Failed to translate text.");
  }
}
