import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API 路由 - 代理 Gemini 請求 (解決 Cloud Run 環境變數在瀏覽器不可見的問題)
  app.post("/api/chat", async (req, res) => {
    try {
      const { prompt, systemInstruction, model } = req.body;
      
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'undefined') {
        return res.status(500).json({ error: "伺服器未設定 GEMINI_API_KEY。請在 Cloud Run 控制台或環境變數中設定。" });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const aiModel = genAI.getGenerativeModel({ 
        model: model || "gemini-1.5-flash",
        systemInstruction: systemInstruction
      });

      const result = await aiModel.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      res.json({ text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "發生未知錯誤" });
    }
  });

  // 檢查系統金鑰狀態的 API
  app.get("/api/status", (req, res) => {
    const key = process.env.GEMINI_API_KEY;
    const hasKey = !!(key && key !== 'MY_GEMINI_API_KEY' && key !== 'undefined' && key !== '');
    res.json({ 
      hasSystemKey: hasKey,
      message: hasKey ? "系統金鑰已備妥" : "環境變數中找不到有效金鑰"
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const key = process.env.GEMINI_API_KEY;
    const hasKey = !!(key && key !== 'MY_GEMINI_API_KEY' && key !== 'undefined' && key !== '');
    console.log(`Server running on port ${PORT}`);
    console.log(`System API Key detected: ${hasKey ? 'YES' : 'NO'}`);
    if (!hasKey) {
      console.warn("WARNING: GEMINI_API_KEY is not set or is invalid. Server-side AI features will not work.");
    }
  });
}

startServer();
