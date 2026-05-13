import { useState, type ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, TreePine, MapPin, Globe, BookOpen, MessageCircle, Info, Loader2, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_INSTRUCTION = `你是一位專業的嘉義木都文化導覽員。你的任務是根據以下知識庫回答使用者的問題。
請使用親切、適合國小高年級學生的口吻回答。

知識庫內容：
1. 嘉義木都：嘉義緊鄰阿里山，擁有高品質的紅檜與扁柏。日治時期建了森林鐵路，並在嘉義市區設立大型製材所，全台灣木造房屋比例最高的地方就在嘉義。林森路一帶曾經是木材集散中心。
2. 東市場：被稱為「嘉義人的大廚房」。屋頂使用不用釘子的「卡榫」技術，運用檜木與杉木搭建，讓市場環境涼爽通風，是珍貴的歷史建築。
3. 阿里山森林鐵路：具有 Z 字型爬升、螺旋爬升等偉大鐵道技術，見證了台灣百年的林業興衰，是具備世界級普世價值的「遺產潛力點」。它連結了嘉義市區（海拔30公尺）與山上（海拔2216公尺）。
4. 檜木：阿里山產紅檜和扁柏（黃檜），它們會散發芬多精，不但木質堅硬不容易爛，還有特殊的香氣，是以前做高級家具的首選。
5. 老屋：嘉義市有很多『舊屋力』修復的老房子，這些木構老屋保存了城市的靈魂。可以去參觀由老診所改建的咖啡館，體驗木材的溫度。
6. 卡榫：一種不用釘子的智慧技術，利用木頭凹凸的結構相互嵌合，不但堅固還很有彈性，地震來時也能吸收衝擊力。
7. 校園碳匯科學研究（民族國小 43 屆科展成果）：
   - 研究顯示校園內共 28 種樹種、120 棵樹木，總固碳量約 107,603.01 kg CO2e。
   - 固碳能力最強的是「台灣相思樹」(50-80kg/年)，其次是「樟樹」(40-60kg/年) 與「楓香」(30-50kg/年)。
   - 透過自製 MH-Z19B 感測器監測發現：中午 11-12 點因光合作用旺盛，周圍 CO2 濃度最低；早晨 7-8 點濃度則最高。
   - 這是利用科學儀器（IoT 物聯網技術）結合在地木文化，探索減碳貢獻的實踐。

如果使用者的問題與嘉義木都、東市場、阿里山林業、木造建築、校園樹木碳匯研究、嘉義歷史等主題完全無關，請務必回答：『這個問題超過我的知識範圍。你可以先試著問問：木都、東市場、檜木、校園碳匯、老屋等話題喔！』。
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
  const [userApiKey, setUserApiKey] = useState<string>('');
  const [useUserKey, setUseUserKey] = useState<boolean>(false);

  // 載入儲存的 API Key
  useEffect(() => {
    const savedKey = localStorage.getItem('GEMINI_CUSTOM_KEY');
    if (savedKey) {
      setUserApiKey(savedKey);
      setUseUserKey(true);
    }
  }, []);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const saveUserKey = (key: string) => {
    try {
      if (key.trim()) {
        localStorage.setItem('GEMINI_CUSTOM_KEY', key.trim());
        setUserApiKey(key.trim());
        setUseUserKey(true);
        setSaveStatus('success');
      } else {
        localStorage.removeItem('GEMINI_CUSTOM_KEY');
        setUserApiKey('');
        setUseUserKey(false);
        setSaveStatus('success');
      }
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 檢查 API Key 狀態
  useEffect(() => {
    const checkApiKey = async () => {
      // 優先檢查個人金鑰
      if (useUserKey && userApiKey) {
        setApiKeyStatus({ 
          valid: true, 
          message: '已使用個人金鑰，系統連線準備就緒！', 
          count: 1 
        });
        return;
      }

      // 如果是在 AI Studio 預覽環境 (AIS_PREVIEW 或類似環境變數)
      // 但在 Cloud Run 部署環境，process.env 通常是空的
      // 我們透過後端 API 檢查系統金鑰
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        if (data.hasSystemKey) {
          setApiKeyStatus({ 
            valid: true, 
            message: `✅ 系統已就緒：已自動連接民族國小圖書資源，您可以直接開始問答。`, 
            count: 1 
          });
        } else {
          // 如果後端也沒有，嘗試檢查 Vite 本身是否注入了 (預覽模式常用)
          const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
          if (viteKey && viteKey !== 'undefined') {
             setApiKeyStatus({ 
              valid: true, 
              message: `✅ 預覽模式：已成功連接預設金鑰。`, 
              count: 1 
            });
          } else {
            setApiKeyStatus({ 
              valid: false, 
              message: '未偵測到系統金鑰。請在 Cloud Run 設定 GEMINI_API_KEY。目前僅能使用個人金鑰。', 
              count: 0 
            });
          }
        }
      } catch (err: any) {
        // 可能是靜態部署 (如 GitHub Pages)，後端 API 不存在
        const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (viteKey && viteKey !== 'undefined') {
          setApiKeyStatus({ 
            valid: true, 
            message: `✅ 預覽模式：已成功連接。`, 
            count: 1 
          });
        } else {
          setApiKeyStatus({ 
            valid: false, 
            message: `無法偵測系統金鑰 (錯誤: ${err.message})。請點擊「系統狀態」輸入個人金鑰方可使用。`, 
            count: 0 
          });
        }
      }
    };
    checkApiKey();
  }, [useUserKey, userApiKey]);

  const callGemini = async (prompt: string): Promise<string> => {
    // 1. 如果使用者設定了個人金鑰，直接從前端呼叫 (節省伺服器資源)
    if (useUserKey && userApiKey) {
      try {
        const genAI = new GoogleGenerativeAI(userApiKey);
        const model = genAI.getGenerativeModel({ 
          model: MODEL_NAME,
          systemInstruction: SYSTEM_INSTRUCTION
        });
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      } catch (err: any) {
        throw new Error(`個人金鑰連線失敗: ${err?.message || "未知錯誤"}`);
      }
    }

    // 2. 否則透過後端 API 使用系統金鑰 (安全性高，且能存取 Cloud Run 環境變數)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemInstruction: SYSTEM_INSTRUCTION,
          model: MODEL_NAME
        })
      });

      const data = await res.json();
      if (!res.ok) {
        // 如果後端失敗，回報錯誤
        throw new Error(data.error || `伺服器回應錯誤 (${res.status})`);
      }
      return data.text;
    } catch (err: any) {
      // 如果後端 API 本身不可用 (例如 GitHub Pages 只有前端)，則提示使用者
      if (err.message.includes("Unexpected token") || err.message.includes("is not valid JSON") || err.message.includes("HTTP 404")) {
        throw new Error("部署版本目前無法存取伺服器 API。請點擊「系統狀態」並使用個人金鑰。");
      }
      throw new Error(`連線失敗: ${err?.message || "未知錯誤"}`);
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
              className="mb-8 space-y-4 overflow-hidden"
            >
              <div className={`p-4 rounded-xl border flex items-center gap-3 ${apiKeyStatus.valid ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {apiKeyStatus.valid ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                <span className="text-sm font-medium">{apiKeyStatus.message}</span>
              </div>

              <div className="bg-white p-6 rounded-xl border border-amber-200 shadow-sm">
                <h3 className="text-[#5d4037] font-bold mb-4 flex items-center gap-2">
                  <Globe size={18} className="text-amber-600" />
                  使用個人 API 金鑰 (選填)
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  如果您有自己的 Google Gemini API Key，可以在這裡輸入。我們會優先使用您的金鑰進行問答，這將儲存在您的瀏覽器中。
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input 
                    type="password" 
                    value={userApiKey}
                    onChange={(e) => setUserApiKey(e.target.value)}
                    placeholder="在此貼上您的 API Key..."
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={() => saveUserKey(userApiKey)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                        saveStatus === 'success' ? 'bg-green-600 text-white' : 
                        saveStatus === 'error' ? 'bg-red-600 text-white' : 
                        'bg-amber-600 hover:bg-amber-700 text-white'
                      }`}
                    >
                      {saveStatus === 'success' ? '已儲存 ✅' : saveStatus === 'error' ? '儲存失敗 ❌' : '儲存金鑰'}
                    </button>
                    <button 
                      onClick={() => {
                        saveUserKey('');
                      }}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      清除
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="useKey" 
                    checked={useUserKey} 
                    onChange={(e) => setUseUserKey(e.target.checked)}
                    className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <label htmlFor="useKey" className="text-xs text-gray-600 font-medium cursor-pointer">
                    優先使用個人金鑰
                  </label>
                </div>
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
              title="科學「碳」險隊"
              content="民族國小學生科展發現：校園 120 棵樹木總固碳量高達 10.7 萬公斤！其中相思樹與樟樹是固碳高手，透過物聯網監測發現，中午是樹木最努力吸碳的時刻。"
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
