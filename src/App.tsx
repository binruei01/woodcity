import { useState, type ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, TreePine, MapPin, Globe, BookOpen, MessageCircle, Info, Loader2, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `你是一位專業的嘉義木都文化導覽員。你的任務是根據以下知識庫回答使用者的問題。
請使用親切、適合國小高年級學生的口吻回答。

知識庫內容：
1. 嘉義木都：嘉義緊鄰阿里山，擁有高品質的紅檜與扁柏。日治時期建了森林鐵路，並在嘉義市區設立大型製材所，全台灣木造房屋比例最高的地方就在嘉義。林森路一帶曾經是木材集散中心。
2. 東市場：被稱為「嘉義人的大廚房」。屋頂使用不用釘子的「卡榫」技術，運用檜木與杉木搭建，讓市場環境涼爽通風，是珍貴的歷史建築。
3. 阿里山森林鐵路：具有 Z 字型爬升、螺旋爬升等偉大鐵道技術，見證了台灣百年的林業興衰，是具備世界級普世價值的「遺產潛力點」。它連結了嘉義市區（海拔30公尺）與山上（海拔2216公尺）。
4. 檜木：阿里山產紅檜和扁柏（黃檜），它們會散發芬多精，不但木質堅硬不容易爛，還有特殊的香氣，是以前做高級家具的首選。
5. 老屋：嘉義市有很多『舊屋力』修復的老房子，這些木構老屋保存了城市的靈魂。可以去參觀由老診所改建的咖啡館，體驗木材的溫度。
6. 卡榫：一種不用釘子的智慧技術，利用木頭凹凸的結構相互嵌合，不但堅固還很有彈性，地震來時也能吸收衝擊力。

如果使用者的問題與嘉義木都、東市場、阿里山林業、木造建築、嘉義歷史等主題完全無關，請務必回答：『這個問題超過我的知識範圍。你可以先試著問問：木都、東市場、檜木、世界遺產、老屋等話題喔！』。
如果問題相關但知識庫沒提到，請根據你的專業知識（嘉義文化導覽員）給予正確且有趣的補充。`;

// 穩定版模型名稱
const MODEL_NAME = "gemini-flash-latest";

export default function App() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ key: string; text: string } | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<{ question: string; answer: string; timestamp: string }[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<{ valid: boolean; message: string; count: number }>({ valid: false, message: '檢查中...', count: 0 });

  // 檢查 API Key 狀態
  useEffect(() => {
    const checkApiKey = () => {
      const key = process.env.GEMINI_API_KEY;
      const otherKeys = process.env.GEMINI_API_KEYS;
      
      const allKeys = [
        key,
        ...(otherKeys ? otherKeys.split(',').map(k => k.trim()) : [])
      ].filter(k => k && k !== 'MY_GEMINI_API_KEY' && k !== 'undefined' && k !== '');

      if (allKeys.length === 0) {
        setApiKeyStatus({ valid: false, message: '未偵測到有效的 API Key。請在 Secrets 面板設定 GEMINI_API_KEY 或 GEMINI_API_KEYS。', count: 0 });
      } else {
        setApiKeyStatus({ valid: true, message: `系統已準備就緒，偵測到 ${allKeys.length} 組 API Key。`, count: allKeys.length });
      }
    };
    checkApiKey();
  }, []);

  const callGemini = async (prompt: string, retryCount = 0): Promise<string> => {
    const key = process.env.GEMINI_API_KEY;
    const otherKeys = process.env.GEMINI_API_KEYS;
    
    const allKeys = [
      key,
      ...(otherKeys ? otherKeys.split(',').map(k => k.trim()) : [])
    ].filter(k => k && k !== 'MY_GEMINI_API_KEY' && k !== 'undefined' && k !== '');

    if (allKeys.length === 0) {
      throw new Error("找不到有效的 API Key。請確認已在 Secrets 面板設定 GEMINI_API_KEY 並重新整理網頁。");
    }

    // 輪詢選擇金鑰 (根據重試次數選擇下一個)
    const currentKey = allKeys[retryCount % allKeys.length];
    
    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
        },
      });

      if (!response || !response.text) {
        throw new Error("API 回傳內容為空。");
      }

      return response.text;
    } catch (err: any) {
      const errMsg = err?.message || "";
      console.warn(`[嘗試 ${retryCount + 1}] 金鑰失敗:`, errMsg);

      if ((errMsg.includes('429') || errMsg.toLowerCase().includes('quota')) && retryCount < allKeys.length - 1) {
        return callGemini(prompt, retryCount + 1);
      }

      if (errMsg.includes('API_KEY_INVALID')) {
        if (retryCount < allKeys.length - 1) return callGemini(prompt, retryCount + 1);
        throw new Error("所有 API Key 都無效，請檢查設定。");
      }

      throw new Error(`連線失敗: ${errMsg || "未知錯誤"}`);
    }
  };

  const handleSearch = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      setError('請輸入想問的關鍵字喔！');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const answer = await callGemini(trimmedInput);
      
      if (answer.includes("這個問題超過我的知識範圍")) {
        setError(answer);
      } else {
        setResult({ key: trimmedInput, text: answer });
        setHistory(prev => [{
          question: trimmedInput,
          answer: answer,
          timestamp: new Date().toLocaleTimeString()
        }, ...prev]);
      }
    } catch (err: any) {
      setError(err?.message || "發生錯誤，請稍後再試。");
    } finally {
      setIsLoading(false);
      setInput('');
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf0] font-sans text-gray-800 selection:bg-amber-200">
      {/* Navigation Bar */}
      <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-amber-100 px-4 py-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 font-bold text-[#5d4037]">
            <TreePine className="text-green-600" size={24} />
            <span className="hidden sm:inline">嘉義木都導覽小學堂~民族國小圖書館專區</span>
            <span className="sm:hidden">木都導覽~民族國小</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="text-xs text-gray-400 hover:text-[#5d4037] transition-colors"
            >
              系統狀態
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative bg-[#5d4037] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]"></div>
        </div>
        <div className="max-w-6xl mx-auto py-16 px-6 text-center relative z-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-block bg-amber-400 text-[#5d4037] px-4 py-1 rounded-full text-sm font-bold mb-6"
          >
            🏮 民族國小PBL計劃教學團隊
          </motion.div>
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-4xl md:text-6xl font-black mb-6 tracking-tight"
          >
            探索嘉義木都文化與在地導覽
          </motion.h1>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-amber-100/90 max-w-2xl mx-auto leading-relaxed"
          >
            從阿里山鐵路到東市場的卡榫智慧，讓我們一起走進這座全台灣木造房屋比例最高的城市。
          </motion.p>
        </div>
        <div className="h-12 bg-[#fffaf0] rounded-t-[3rem] -mt-12 relative z-20"></div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-20">
        {/* Debug Panel */}
        <AnimatePresence>
          {showDebug && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className={`p-4 rounded-xl border flex items-center gap-3 ${apiKeyStatus.valid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {apiKeyStatus.valid ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                <span className="text-sm font-medium">{apiKeyStatus.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Knowledge Section */}
        <section className="mb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-8 w-1.5 bg-green-600 rounded-full"></div>
            <h2 className="text-2xl font-bold text-[#5d4037]">核心知識卡片</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <InfoCard 
              icon={<TreePine className="text-green-600" />}
              title="木都的由來"
              content="嘉義緊鄰阿里山，擁有高品質的紅檜與扁柏。日治時期建了森林鐵路，並在嘉義市區設立大型製材所，全台灣木造房屋比例最高的地方就在嘉義。"
              delay={0.1}
            />
            <InfoCard 
              icon={<MapPin className="text-red-600" />}
              title="東市場的大木作"
              content="東市場被稱為「嘉義人的大廚房」。屋頂使用不用釘子的「卡榫」技術，運用檜木與杉木搭建，讓市場環境涼爽通風，是珍貴的歷史建築。"
              delay={0.2}
            />
            <InfoCard 
              icon={<Globe className="text-blue-600" />}
              title="世界遺產潛力"
              content="阿里山森林鐵路具有 Z 字型爬升等偉大鐵道技術，見證了台灣百年的林業興衰，是具備世界級普世價值的「遺產潛力點」。"
              delay={0.3}
            />
          </div>
        </section>

        {/* Interactive Q&A */}
        <section id="qa" className="relative">
          <div className="absolute -inset-4 bg-white/40 rounded-[2.5rem] blur-xl -z-10"></div>
          <div className="bg-white p-8 md:p-12 rounded-[2rem] border-2 border-[#5d4037]/10 shadow-2xl shadow-amber-900/5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <div className="flex items-center gap-4">
                <div className="bg-[#5d4037] p-3 rounded-2xl text-white">
                  <MessageCircle size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[#5d4037]">文化導覽員問答</h2>
                  <p className="text-gray-500 text-sm">輸入任何關於嘉義木都的問題，我會為你解答！</p>
                </div>
              </div>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!isLoading) handleSearch();
              }}
              className="relative mb-10"
            >
              <input 
                type="text" 
                inputMode="search"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                placeholder="例如：什麼是卡榫？、嘉義為什麼叫木都？"
                className="w-full pl-6 pr-36 py-5 rounded-2xl border-2 border-gray-100 focus:border-green-500 focus:outline-none focus:ring-4 focus:ring-green-500/10 transition-all text-lg placeholder:text-gray-300 disabled:bg-gray-50"
              />
              <button 
                type="submit"
                disabled={isLoading}
                className="absolute right-2 top-2 bottom-2 bg-[#2e7d32] hover:bg-[#1b5e20] text-white font-bold px-8 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
              >
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                <span className="hidden sm:inline">開始問答</span>
              </button>
            </form>

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-20 text-center"
                >
                  <div className="inline-flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-green-600" size={48} />
                    <p className="text-gray-400 font-medium animate-pulse">導覽員正在翻閱歷史資料中...</p>
                  </div>
                </motion.div>
              ) : (result || error) ? (
                <motion.div 
                  key={result ? result.key : 'error'}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`p-8 rounded-3xl border ${result ? 'bg-amber-50/50 border-amber-200' : 'bg-red-50 border-red-200'}`}
                >
                  {result ? (
                    <div className="prose prose-amber max-w-none">
                      <div className="flex items-center gap-2 mb-4 text-[#5d4037] font-bold text-lg">
                        <BookOpen size={22} className="text-amber-600" />
                        💡 導覽員的回答：
                      </div>
                      <p className="text-[#4e342e] text-lg leading-relaxed whitespace-pre-wrap">{result.text}</p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4 text-red-700">
                      <AlertCircle size={24} className="mt-1 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-lg mb-1">哎呀，出了一點問題：</p>
                        <p className="opacity-90">{error}</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="py-20 text-center border-4 border-dashed border-gray-50 rounded-[2rem]">
                  <p className="text-gray-300 text-lg font-medium">在上方輸入問題，開啟你的木都探索之旅！</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* History Section */}
        {history.length > 0 && (
          <section className="mt-20">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1.5 bg-amber-600 rounded-full"></div>
                <h2 className="text-2xl font-bold text-[#5d4037]">對話紀錄</h2>
              </div>
              <button 
                onClick={() => setHistory([])}
                className="text-sm text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                清除紀錄
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {history.map((item, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-amber-100/50 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">問：{item.question}</span>
                    <span className="text-[10px] text-gray-400">{item.timestamp}</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                    {item.answer}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#3e2723] text-[#d7ccc8] py-16 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 font-bold text-2xl mb-4">
              <TreePine className="text-green-400" size={32} />
              <span>嘉義木都導覽小學堂~民族國小圖書館專區</span>
            </div>
            <p className="text-amber-100/60 max-w-md">
              本網頁由嘉義市東區民族國小PBL計劃教學團隊製作，旨在推廣嘉義市木都文化與在地導覽，適合本市高年級參考使用。
            </p>
          </div>
          <div className="text-center md:text-right">
            <p className="text-sm mb-2">© 2026 嘉義市民族國小PBL計劃教學團隊</p>
            <p className="text-xs text-amber-100/40">Powered by Google Gemini AI</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function InfoCard({ icon, title, content, delay }: { icon: ReactNode, title: string, content: string, delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="group bg-white p-8 rounded-3xl border-b-8 border-green-600/10 shadow-lg hover:shadow-xl hover:border-green-600 transition-all duration-300"
    >
      <div className="bg-gray-50 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-[#5d4037] mb-4">{title}</h3>
      <p className="text-gray-500 leading-relaxed">
        {content}
      </p>
    </motion.div>
  );
}
