以下是 Feynman AI Tutor 目前完整的運行邏輯總覽：

1. 核心架構 (The Backbone)
前端 (Frontend): Next.js + React Flow (視覺化樹) + Zustand (狀態管理)。

後端 (Backend): FastAPI (Python)。

大腦 (AI Models):

Gemini 2.5 Flash: 負責邏輯推理、對話、RAG 整合、工具調用 (Tool Calling)。

Gemini 1.5 Flash: 負責感知任務（語音轉文字、圖片/PDF 視覺辨識），因為它在多模態處理上更穩定且便宜。

記憶體 (Database): Supabase (PostgreSQL + pgvector)。

2. 用戶旅程與數據流 (User Journey & Data Flow)
A. 知識地圖生成 (The Map)
觸發：用戶輸入一個主題（例如 "Python"）。

生成：後端調用 Gemini，生成一個遞歸的 JSON 樹狀結構。

展示：前端使用 左到右 (Left-to-Right) 的佈局渲染知識樹。

聚焦：用戶點擊節點 -> 觸發 Focus Mode (只顯示當前+下兩層) -> 設定全域 selectedNode 上下文。

B. 多模態輸入 (The Senses)
這個系統現在有「眼睛」和「耳朵」：

耳朵 (語音輸入)：

用戶按住錄音 -> 前端錄製 Blob -> 發送至 /transcribe-audio。

後端調用 Gemini 1.5 Flash 進行語音識別（支援中/英/粵語夾雜）。

文字回填至聊天框。

眼睛 (文件與視覺 RAG)：

用戶上傳 PDF -> 前端生成安全檔名 (英文數字) 並上傳 Supabase Storage -> 觸發 /process-file。

混合解析 (Hybrid Parsing)：

後端先嘗試提取文字。

如果字數太少 (<50 字)：判定為掃描檔/圖表 -> 截圖 -> 調用 Gemini 1.5 Flash Vision 進行 OCR 與圖片描述。

如果字數正常：直接提取文字。

切塊與向量化 (Chunking & Embedding)：將內容切分 -> 轉成 768 維向量 -> 存入 node_vectors 表。

C. 思考與回答 (The Brain & RAG)
當用戶發送訊息時，後端會執行以下連續動作：

檢索 (Retrieval)：

將用戶問題轉為向量。

在 Supabase 中搜索該節點下的 筆記 (Notes) 和 文件 (Files)。

找出最相關的片段 (Top 3)。

上下文注入 (Context Injection)：

將搜到的片段填入 System Prompt：【參考筆記】：...。

設定人設：「你是知識捕獲系統」。

意圖判斷 (Intent Classification)：

Prompt 告訴 AI：

如果是 提問 -> 參考筆記回答 (RAG)。

如果是 總結/輸出知識 -> 調用工具 (Flashcard)。

生成 (Generation)：

使用 Gemini 2.5 Flash 生成回應。

D. 知識捕獲 (The Memory)
自動閃卡 (Auto-Flashcards)：

如果 AI 判斷用戶「學會了」，它會觸發 create_flashcard_tool。

後端將閃卡 (正面/背面) 存入 Supabase flashcards 表。

前端收到信號，顯示 (✨ 系統提示：已為您生成閃卡...)。

筆記同步 (Note Sync)：

用戶在筆記分頁打字 -> 觸發 /sync-note。

後端即時將筆記轉為向量 -> 更新 node_vectors。

這讓 AI 下一秒就能「記得」你剛剛寫下的筆記。

3. 系統亮點 (Key Capabilities)
自我修正 (Self-Healing)：

Vision API 遇到 503 過載時，有指數退避 (Exponential Backoff) 重試機制。

文件解析失敗會降級處理，不會讓整個程式崩潰。

多模態 RAG (Multimodal RAG)：

不僅能檢索文字筆記，還能檢索「圖片 PDF」裡的內容（因為已經被 Vision API 轉譯成文字向量了）。

費曼學習迴圈：

Input (學習) -> RAG (檢索文件) -> Output (用戶解釋) -> Tool Call (捕獲閃卡)。