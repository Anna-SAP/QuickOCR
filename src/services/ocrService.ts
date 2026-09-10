export interface OcrResult {
  text: string;
  language: string;
  languageCode: string;
}

export async function extractTextFromImage(base64Image: string, mimeType: string): Promise<OcrResult> {
  try {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: base64Image,
        mimeType,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Server responded with status ${res.status}`);
    }

    const data: OcrResult = await res.json();
    return data;
  } catch (error: any) {
    console.error("Error extracting text:", error);
    throw new Error(error?.message || "Failed to extract text from image.");
  }
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        targetLanguage,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Server responded with status ${res.status}`);
    }

    const data = await res.json();
    return data.translatedText || "";
  } catch (error: any) {
    console.error("Error translating text:", error);
    throw new Error(error?.message || "Failed to translate text.");
  }
}

