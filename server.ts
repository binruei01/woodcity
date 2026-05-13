import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API 路由 - 已移除至前端以符合規範
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // 檢查系統金鑰狀態的 API (僅回報是否存在環境變數)
  app.get("/api/status", (req, res) => {
    const key = process.env.GEMINI_API_KEY;
    const hasKey = !!(key && key !== 'MY_GEMINI_API_KEY' && key !== 'undefined' && key !== '');
    res.json({ 
      hasSystemKey: hasKey,
      message: hasKey ? "系統金鑰已備妥" : "環境變數中找不到 GEMINI_API_KEY"
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
