import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware to parse JSON with increased limit for base64 image data
app.use(express.json({ limit: "15mb" }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 未配置，请在 AI Studio 设置中绑定 API 密钥。");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Candidate models in order of priority. If the primary model experiences high demand (503), the server falls back to alternatives.
const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

function formatErrorMessage(error: any): string {
  let raw = error?.message || String(error);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) {
      raw = parsed.error.message;
    }
  } catch {}

  if (
    raw.includes("503") ||
    raw.includes("high demand") ||
    raw.includes("UNAVAILABLE") ||
    raw.includes("spikes in demand")
  ) {
    return "AI 模型当前正处于高峰期临时繁忙（503），系统已尝试多节点备用线路。请稍等 2~3 秒后重试。";
  }
  if (raw.includes("429") || raw.includes("quota") || raw.includes("RESOURCE_EXHAUSTED")) {
    return "请求频次已达到临时上限（429），请稍等数秒后再试。";
  }
  if (raw.includes("permission denied") || raw.includes("PERMISSION_DENIED")) {
    return "API 访问权限不足，请确认在 AI Studio Secrets 中绑定的 GEMINI_API_KEY 是否有效。";
  }
  return raw;
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", hasApiKey: Boolean(process.env.GEMINI_API_KEY) });
});

// OCR endpoint with multi-model fallback and retry
app.post("/api/ocr", async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ error: "请提供图片数据" });
    }

    const ai = getGeminiClient();
    let lastError: any = null;

    for (const model of CANDIDATE_MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`Trying OCR with model: ${model} (attempt ${attempt + 1})`);
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      data: image,
                      mimeType: mimeType || "image/png",
                    },
                  },
                  {
                    text: "Extract all text from this image. Preserve the original layout and formatting as much as possible. Also detect the primary language of the text.",
                  },
                ],
              },
            ],
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

          const responseText = response.text;
          if (responseText) {
            const parsed = JSON.parse(responseText);
            return res.json(parsed);
          }
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || "";
          console.warn(`Model ${model} attempt ${attempt + 1} failed:`, msg);

          const isOverloaded =
            msg.includes("503") ||
            msg.includes("high demand") ||
            msg.includes("UNAVAILABLE") ||
            msg.includes("429");

          if (isOverloaded && attempt === 0) {
            // Wait 800ms before second attempt on same model
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          }
          // Break to next candidate model
          break;
        }
      }
    }

    throw lastError || new Error("所有候选模型处理均未成功");
  } catch (error: any) {
    console.error("OCR API final error:", error);
    const friendlyMessage = formatErrorMessage(error);
    return res.status(500).json({ error: friendlyMessage });
  }
});

// Translation endpoint with multi-model fallback
app.post("/api/translate", async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    if (!text || !targetLanguage) {
      return res.status(400).json({ error: "Missing text or targetLanguage" });
    }

    const ai = getGeminiClient();
    let lastError: any = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        console.log(`Trying translation with model: ${model}`);
        const response = await ai.models.generateContent({
          model,
          contents: `Translate the following text to ${targetLanguage}. Only return the translated text, no other comments or markdown formatting.\n\nText:\n${text}`,
        });

        if (response.text) {
          return res.json({ translatedText: response.text });
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Translation with model ${model} failed:`, err?.message);
        continue;
      }
    }

    throw lastError || new Error("所有候选模型翻译均未成功");
  } catch (error: any) {
    console.error("Translation API error:", error);
    const friendlyMessage = formatErrorMessage(error);
    return res.status(500).json({ error: friendlyMessage });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Quick-OCR server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

