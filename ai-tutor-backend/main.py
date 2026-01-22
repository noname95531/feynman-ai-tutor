import os
import json
import re
import time
import random
import logging
import io
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from google import genai
from google.genai import types, errors
from supabase import create_client, Client
import fitz  # PyMuPDF
from PIL import Image

# ==========================================
# 0. 配置區域 & 日誌設置
# ==========================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

# 模型名稱配置
MODEL_NAME = os.getenv("MODEL_NAME", "gemini-2.5-flash")

# ==========================================
# 1. 環境變量與初始化
# ==========================================

def load_env_file():
    """從 .env 文件加載環境變量 (兼容 UTF-8 和 UTF-16)"""
    env_file = Path(__file__).parent / ".env"
    if not env_file.exists():
        return

    for encoding in ["utf-8", "utf-16"]:
        try:
            with open(env_file, "r", encoding=encoding) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        if key.strip() not in os.environ:
                            os.environ[key.strip()] = value.strip('"\'')
            break
        except (UnicodeDecodeError, Exception):
            continue

load_env_file()

# 初始化 Gemini 客戶端
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.error("❌ 未找到 GEMINI_API_KEY")
    raise RuntimeError("GEMINI_API_KEY is missing")

genai_client = genai.Client(api_key=GEMINI_API_KEY)

# ==========================================
# API 密鑰驗證設置
# ==========================================

# 定義一個簡單的 API Key Header 檢查
API_KEY_NAME = "X-API-SECRET"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

# 從環境變數讀取你自己設定的密碼
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "my_super_secret_password")

async def verify_api_key(api_key: str = Security(api_key_header)):
    """驗證請求是否包含正確的密鑰"""
    if api_key != INTERNAL_API_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )

# ==========================================
# 2. Supabase 單例模式
# ==========================================

class SupabaseManager:
    """管理 Supabase 連接的單例類"""
    _instance: Optional[Client] = None
    _key_type: str = "none"

    @classmethod
    def get_client(cls) -> Client:
        if cls._instance:
            return cls._instance

        url = os.getenv("SUPABASE_URL")
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        anon_key = os.getenv("SUPABASE_KEY")

        if not url:
            logger.warning("⚠️ 未檢測到 SUPABASE_URL")
            raise RuntimeError("Missing SUPABASE_URL")

        # 優先使用 Service Role Key 以繞過 RLS
        key = service_key or anon_key
        if not key:
            raise RuntimeError("Missing SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY")

        cls._key_type = "service_role" if service_key else "anon"
        logger.info(f"🔑 初始化 Supabase Client (Key Type: {cls._key_type})")
        
        cls._instance = create_client(url, key)
        return cls._instance

    @classmethod
    def get_key_type(cls) -> str:
        return cls._key_type

# ==========================================
# 3. FastAPI 應用設置
# ==========================================

app = FastAPI(title="AI Feynman Tutor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "feynman-ai-tutor-amber.vercel.app", # 🔥 新增 Vercel 的網址
        "*" # (測試時可先用 * 允許所有，但不建議長期使用)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 4. 數據模型 (Pydantic)
# ==========================================

class GenerateTreeRequest(BaseModel):
    topic: str

class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, Any]] = []
    node_context: Dict[str, Any]
    user_id: Optional[str] = None
    tree_id: Optional[str] = None

class SyncNoteRequest(BaseModel):
    user_id: str
    tree_id: str
    node_id: str
    content: str

class ProcessFileRequest(BaseModel):
    user_id: str
    tree_id: str
    node_id: str
    file_path: str  # Supabase Storage 中的路徑
    file_type: str  # 例如 'application/pdf'

# ==========================================
# 5. 輔助函數 (Embedding & RAG & Tools)
# ==========================================

def generate_embedding(text: str) -> List[float]:
    """將文字轉為 768 維向量 (修復參數格式問題)"""
    try:
        # 使用 contents=[text] 確保回傳結構為 List
        result = genai_client.models.embed_content(
            model="text-embedding-004",
            contents=[text], 
        )
        
        if hasattr(result, 'embeddings') and result.embeddings:
            return result.embeddings[0].values
        elif hasattr(result, 'embedding') and result.embedding:
            return result.embedding.values
        else:
            logger.error(f"⚠️ Embedding format mismatch! Dir: {dir(result)}")
            return []
            
    except Exception as e:
        logger.error(f"❌ Embedding generation failed: {e}")
        return []

def search_relevant_notes(query: str, user_id: str, node_id: str) -> str:
    """RAG 核心：搜索相關筆記"""
    try:
        query_vector = generate_embedding(query)
        if not query_vector:
            return ""

        supabase = SupabaseManager.get_client()
        
        # 調用 SQL 中定義的 RPC 函數
        response = supabase.rpc("match_vectors", {
            "query_embedding": query_vector,
            "match_threshold": 0.3, # 降低門檻以增加召回率 (筆記通常較短)
            "match_count": 3,
            "filter_node_id": node_id,
            "filter_user_id": user_id
        }).execute()

        if response.data:
            context_text = "\n".join([f"- {item['content']}" for item in response.data])
            logger.info(f"🔍 RAG Hit! Found context: {context_text[:50]}...")
            return context_text
        return ""
    except Exception as e:
        logger.warning(f"⚠️ Vector search failed: {e}")
        return ""

def get_flashcard_tool_declaration() -> types.FunctionDeclaration:
    return types.FunctionDeclaration(
        name="create_flashcard_tool",
        description="創建一張閃卡。只有當用戶明確總結知識或解釋概念時才使用。",
        parameters={
            "type": "object",
            "properties": {
                "front": {"type": "string", "description": "閃卡正面內容（繁體中文）"},
                "back": {"type": "string", "description": "閃卡背面內容（精簡答案）"},
            },
            "required": ["front", "back"],
        },
    )

def execute_create_flashcard(front: str, back: str, user_id: str, tree_id: str, node_id: str) -> Dict[str, Any]:
    """執行寫入 Supabase 的邏輯"""
    logger.info(f"🛠️ Executing Tool: Create Flashcard -> {front}")
    
    if not all([user_id, tree_id, node_id]):
        return {"status": "error", "error": "Missing parameters"}

    try:
        supabase = SupabaseManager.get_client()
        data = {
            "user_id": user_id,
            "tree_id": tree_id,
            "node_id": node_id,
            "front": front,
            "back": back
        }
        
        response = supabase.table("flashcards").insert(data).execute()
        
        if hasattr(response, "data") or (hasattr(response, "status_code") and 200 <= response.status_code < 300):
            logger.info("✅ Flashcard inserted successfully.")
            return {"status": "success", "front": front}
        else:
            return {"status": "error", "error": "Database insert failed"}

    except Exception as e:
        logger.exception("❌ Database operation failed")
        return {"status": "error", "error": str(e)}

def download_file_from_supabase(path: str) -> bytes:
    """從 node_assets bucket 下載文件內容"""
    try:
        supabase = SupabaseManager.get_client()
        response = supabase.storage.from_("node_assets").download(path)
        logger.info(f"📥 Downloaded file from: {path} ({len(response)} bytes)")
        return response
    except Exception as e:
        logger.error(f"❌ Failed to download file from {path}: {e}")
        raise HTTPException(status_code=500, detail=f"File download failed: {str(e)}")

def analyze_image_with_gemini(image_bytes: bytes) -> str:
    """使用 Gemini 2.5 Flash 進行視覺分析 (OCR + 描述)，包含重試機制"""
    max_retries = 3
    base_delay = 2  # 基礎等待秒數

    prompt = "請詳細轉錄這張圖片中的所有文字。如果是圖表或圖案，請詳細描述其細節和含義。直接輸出內容，不需要開場白。"

    for attempt in range(max_retries):
        try:
            # 構建請求內容
            contents = [
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=prompt),
                        types.Part.from_bytes(data=image_bytes, mime_type="image/png")
                    ]
                )
            ]

            response = genai_client.models.generate_content(
                model="gemini-1.5-flash",  # 這裡使用 1.5 Flash 比較穩定
                contents=contents
            )
            
            if response.text:
                return response.text
                
        except Exception as e:
            # 檢查是否為 503 Overloaded
            is_overloaded = "503" in str(e) or "overloaded" in str(e).lower()
            
            if is_overloaded and attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"⚠️ Vision Model overloaded. Retrying in {delay:.2f}s... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
                continue # 繼續下一次迴圈
            else:
                # 如果不是 503，或者重試次數用盡，則記錄錯誤並放棄
                logger.warning(f"⚠️ Vision analysis failed after attempt {attempt + 1}: {e}")
                
    return ""
    """使用 Gemini 進行視覺分析 (OCR + 描述)，包含重試機制"""
    max_retries = 3
    base_delay = 2  # 基礎等待秒數

    prompt = "請詳細轉錄這張圖片中的所有文字。如果是圖表或圖案，請詳細描述其細節和含義。直接輸出內容，不需要開場白。"

    for attempt in range(max_retries):
        try:
            # 構建請求內容
            contents = [
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=prompt),
                        types.Part.from_bytes(data=image_bytes, mime_type="image/png")
                    ]
                )
            ]

            response = genai_client.models.generate_content(
                model="gemini-2.5-flash", 
                contents=contents
            )
            
            if response.text:
                return response.text
                
        except Exception as e:
            # 檢查是否為 503 Overloaded
            is_overloaded = "503" in str(e) or "overloaded" in str(e).lower()
            
            if is_overloaded and attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"⚠️ Vision Model overloaded. Retrying in {delay:.2f}s... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
                continue # 繼續下一次迴圈
            else:
                # 如果不是 503，或者重試次數用盡，則記錄錯誤並放棄
                logger.warning(f"⚠️ Vision analysis failed after attempt {attempt + 1}: {e}")
                
    return ""
    """使用 Gemini 2.5 Flash 進行視覺分析 (OCR + 描述)"""
    try:
        # 構建 Prompt
        prompt = "請詳細轉錄這張圖片中的所有文字。如果是圖表或圖案，請詳細描述其細節和含義。直接輸出內容，不需要開場白。"
        
        # 🔥 修正：使用正確的 SDK 結構傳遞圖片與文字
        # Google Gen AI SDK v1.0+ 寫法
        response = genai_client.models.generate_content(
            model="gemini-2.5-flash",  # 🔥 遵照指令：使用 2.5
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=prompt),
                        types.Part.from_bytes(data=image_bytes, mime_type="image/png")
                    ]
                )
            ]
        )
        
        if response.text:
            return response.text
        return ""
        
    except Exception as e:
        logger.warning(f"⚠️ Vision analysis failed: {e}")
        return ""
def extract_text_from_pdf(file_content: bytes) -> str:
    """使用混合策略解析 PDF：文字提取 + Vision OCR"""
    try:
        doc = fitz.open(stream=file_content, filetype="pdf")
        text = ""
        
        for page_num in range(doc.page_count):
            page = doc[page_num]
            
            # 先嘗試直接提取文字
            page_text = page.get_text()
            
            # 判斷是否為掃描檔或純圖片（文字長度小於50字）
            if len(page_text.strip()) < 50:
                logger.info(f"📷 Page {page_num + 1} appears to be scanned/image, using Vision API...")
                
                try:
                    # 將頁面轉換為圖片
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x 解析度提升品質
                    img_bytes = pix.tobytes("png")
                    
                    # 使用 Vision API 分析
                    vision_text = analyze_image_with_gemini(img_bytes)
                    
                    if vision_text:
                        text += f"\n--- 第 {page_num + 1} 頁 (Vision OCR) ---\n{vision_text}\n"
                        logger.info(f"✅ Page {page_num + 1}: Vision OCR successful ({len(vision_text)} chars)")
                    else:
                        text += f"\n--- 第 {page_num + 1} 頁 (無法識別) ---\n"
                        logger.warning(f"⚠️ Page {page_num + 1}: Vision OCR failed")
                        
                except Exception as vision_error:
                    logger.warning(f"⚠️ Page {page_num + 1} vision processing failed: {vision_error}")
                    text += f"\n--- 第 {page_num + 1} 頁 (處理失敗) ---\n"
            else:
                # 文字足夠，直接使用提取的文字
                text += f"\n--- 第 {page_num + 1} 頁 ---\n{page_text}\n"
                logger.info(f"📝 Page {page_num + 1}: Direct text extraction ({len(page_text)} chars)")
        
        doc.close()
        logger.info(f"📄 PDF processing completed: {len(text)} total characters")
        return text
        
    except Exception as e:
        logger.error(f"❌ Failed to extract text from PDF: {e}")
        raise HTTPException(status_code=500, detail=f"PDF text extraction failed: {str(e)}")

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 100) -> List[str]:
    """將長文本切分成多個小片段，保持一定的重疊以保留上下文"""
    if not text.strip():
        return []
    
    chunks = []
    start = 0
    text_length = len(text)
    
    while start < text_length:
        end = start + chunk_size
        
        # 如果不是最後一個chunk，嘗試在句號或換行符處切分
        if end < text_length:
            # 尋找最近的句號或換行符
            for i in range(end, max(start + chunk_size // 2, end - 200), -1):
                if text[i] in '.。\n':
                    end = i + 1
                    break
        
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        
        # 下一個chunk的起始位置考慮重疊
        start = max(start + 1, end - overlap)
        
        # 避免無限循環
        if start >= text_length:
            break
    
    logger.info(f"📝 Text chunked into {len(chunks)} pieces (chunk_size={chunk_size}, overlap={overlap})")
    return chunks

# ==========================================
# 6. API 路由
# ==========================================

@app.get("/health")
async def health_check():
    """健康檢查"""
    status = {"status": "ok", "supabase": False}
    try:
        supabase = SupabaseManager.get_client()
        supabase.table("flashcards").select("id").limit(1).execute()
        status["supabase"] = True
    except Exception as e:
        status["status"] = "warning"
        status["error"] = str(e)
    return status

@app.post("/sync-note", dependencies=[Depends(verify_api_key)])
async def sync_note_vector(request: SyncNoteRequest):
    """當用戶保存筆記時，更新向量庫"""
    try:
        logger.info(f"📝 Syncing note for node: {request.node_id}")
        vector = generate_embedding(request.content)
        if not vector:
            raise HTTPException(status_code=500, detail="Failed to generate embedding")

        supabase = SupabaseManager.get_client()
        
        # 刪除舊向量
        supabase.table("node_vectors").delete().eq("node_id", request.node_id).eq("source_type", "note").execute()
        logger.info(f"🗑️ Deleted old note vectors for node: {request.node_id}")
        
        # 插入新向量
        data = {
            "user_id": request.user_id,
            "tree_id": request.tree_id,
            "node_id": request.node_id,
            "content": request.content,
            "source_type": "note",
            "embedding": vector
        }
        supabase.table("node_vectors").insert(data).execute()
        logger.info("✅ Note vector inserted successfully")
        
        return {"status": "success"}
    except Exception as e:
        logger.exception("Sync note failed")
        return JSONResponse(status_code=500, content={"message": str(e)})

@app.post("/generate-tree", dependencies=[Depends(verify_api_key)])
async def generate_tree(request: GenerateTreeRequest):
    """生成知識樹 (包含 503 重試機制)"""
    logger.info(f"🌳 Generating tree for: {request.topic}")
    
    max_retries = 3
    base_delay = 1

    prompt = f"""
### Role
你是一位精通各領域知識結構的**資深課程設計師與知識圖譜專家**。你擅長將複雜的主題拆解為結構化的學習路徑。

### Task
請為主題 "{request.topic}" 生成一個**結構化的學習知識樹**。

### Requirements
1. **動態層級結構 (Adaptive Hierarchy)**：
   - 樹的深度與廣度應取決於主題 "{request.topic}" 的宏觀程度。
   - 若主題宏觀（如 "Computer Science"），結構應深層且複雜（Root -> 領域 -> 子領域 -> 核心概念 -> 知識點）。
   - 若主題具體（如 "Python List"），結構應較淺，專注於細節拆解。
   
2. **原子化知識點 (Atomic Leaf Nodes)**：
   - 樹狀結構的最底層（葉節點）必須是「原子化知識點」。
   - 定義：**無法再有意義地細分**的單一概念或技能（例如：「變數命名規則」是原子點，「Python 基礎」則不是，因為它還可以細分）。

3. **語言自適應 (Language Matching)**：
   - 節點的 `label` 和 `description` 語言必須與輸入主題 "{request.topic}" 的語言嚴格保持一致。
   - 若輸入是英文，則全英文輸出；若輸入是繁體中文，則全繁體中文輸出。

4. **數據結構 (Adjacency List)**：
   - 雖然是樹狀邏輯，但請返回帶有 `parentId` 的扁平化列表（Flat List）。
   - 根節點的 `parentId` 為 `null`。

### Output Format
請僅返回一個純 JSON 對象，不要包含任何 Markdown 標記或額外文字：
{{
  "nodes": [
    {{
      "id": "唯一標識符 (string)",
      "label": "節點名稱 (string)",
      "description": "簡短的學習目標或定義 (string)",
      "parentId": "父節點ID (string, root 為 null)"
    }}
    ...
  ]
}}
"""

    for attempt in range(max_retries):
        try:
            response = genai_client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    response_mime_type="application/json"
                )
            )
            
            content = re.sub(r'```json\s*|```\s*$', '', response.text).strip()
            parsed = json.loads(content)
            nodes = parsed.get("nodes", parsed)
            return {"nodes": nodes}

        except errors.ServerError as e:
            if e.code == 503:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"⚠️ Model overloaded (503). Retrying in {delay:.2f}s... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
            else:
                raise e
        except Exception as e:
            logger.exception("Tree generation failed")
            raise HTTPException(status_code=500, detail=str(e))
    
    raise HTTPException(status_code=503, detail="Service unavailable after max retries")

@app.post("/process-file", dependencies=[Depends(verify_api_key)])
async def process_file(request: ProcessFileRequest):
    """處理文件：下載、解析、切塊並存入向量庫"""
    try:
        logger.info(f"📁 Processing file: {request.file_path} for node: {request.node_id}")
        
        # 1. 下載文件
        file_content = download_file_from_supabase(request.file_path)
        
        # 2. 根據文件類型解析文字
        if request.file_type == "application/pdf":
            text = extract_text_from_pdf(file_content)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {request.file_type}")
        
        if not text.strip():
            raise HTTPException(status_code=400, detail="No text content found in file")
        
        # 3. 切塊
        chunks = chunk_text(text)
        if not chunks:
            raise HTTPException(status_code=400, detail="Failed to create text chunks")
        
        # 4. 清理舊的文件向量（如果存在）
        supabase = SupabaseManager.get_client()
        supabase.table("node_vectors").delete().eq("node_id", request.node_id).eq("source_type", "file").execute()
        logger.info(f"🗑️ Deleted old file vectors for node: {request.node_id}")
        
        # 5. 批次處理向量
        processed_chunks = 0
        batch_data = []
        
        for i, chunk in enumerate(chunks):
            try:
                # 生成向量
                vector = generate_embedding(chunk)
                if not vector:
                    logger.warning(f"⚠️ Failed to generate embedding for chunk {i+1}")
                    continue
                
                # 準備數據
                data = {
                    "user_id": request.user_id,
                    "tree_id": request.tree_id,
                    "node_id": request.node_id,
                    "content": chunk,
                    "source_type": "file",
                    "embedding": vector,
                    "metadata": {"file_path": request.file_path, "chunk_index": i}
                }
                batch_data.append(data)
                processed_chunks += 1
                
                # 每10個chunk批次插入並休息
                if len(batch_data) >= 10:
                    supabase.table("node_vectors").insert(batch_data).execute()
                    logger.info(f"✅ Inserted batch of {len(batch_data)} chunks")
                    batch_data = []
                    time.sleep(1)  # 避免 API Rate Limit
                    
            except Exception as e:
                logger.warning(f"⚠️ Failed to process chunk {i+1}: {e}")
                continue
        
        # 插入剩餘的chunks
        if batch_data:
            supabase.table("node_vectors").insert(batch_data).execute()
            logger.info(f"✅ Inserted final batch of {len(batch_data)} chunks")
        
        logger.info(f"🎉 File processing completed: {processed_chunks} chunks processed")
        return {
            "status": "success",
            "chunks_processed": processed_chunks,
            "total_chunks": len(chunks),
            "file_path": request.file_path
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("File processing failed")
        return JSONResponse(status_code=500, content={"message": str(e)})

@app.post("/chat", dependencies=[Depends(verify_api_key)])
async def chat_endpoint(request: ChatRequest):
    """聊天接口 - 適配 Gemini 2.0/2.5 思考模型 + RAG 功能 (包含重試機制)"""
    max_retries = 3
    base_delay = 1
    
    for attempt in range(max_retries):
        try:
            # 1. RAG 檢索相關筆記
            rag_context = ""
            if request.user_id and request.node_context.get("id"):
                rag_context = search_relevant_notes(
                    query=request.message,
                    user_id=request.user_id,
                    node_id=request.node_context.get("id")
                )
            
            # 2. 構建 System Prompt (注入 RAG 內容)
            system_instruction = (
                f"你現在不是一個普通的聊天機器人，你是「知識捕獲系統」。\n"
                f"當前上下文：{request.node_context.get('label', '未知節點')} - {request.node_context.get('description', '')}\n"
            )
            
            # 注入 RAG 內容
            if rag_context.strip():
                system_instruction += (
                    f"\n【參考筆記】：用戶之前在這個節點寫過以下筆記，請參考這些內容來輔助回答：\n{rag_context}\n\n"
                )
            
            system_instruction += (
                "你的行為準則：\n"
                "1. **優先回答問題**：如果用戶是在提問（例如「我筆記寫了什麼？」「解釋一下這個概念」），請根據【參考筆記】或你的知識庫直接回答，**不要**調用工具。\n"
                "2. **捕捉學習成果**：只有當用戶明確地**做出總結**、**解釋概念**、或**說「我懂了，是...」**時，才視為「捕獲時刻」，這時必須調用 `create_flashcard_tool`。\n"
                "3. ⚠️ **禁止**在用戶提問時建立閃卡。例如用戶問「什麼是 masuxing？」，你應該回答它，而不是把它做成卡片。\n"
                "4. 如果用戶還沒聽懂，就繼續用蘇格拉底方式引導，不要調用工具。\n"
            )

            # 3. 歷史訊息轉換
            gemini_history = []
            for msg in request.history:
                role = "model" if msg["role"] in ["assistant", "model"] else "user"
                gemini_history.append(
                    types.Content(role=role, parts=[types.Part.from_text(text=str(msg["content"]))])
                )

            logger.info(f"🤖 Sending request to {MODEL_NAME}...")

            # 4. 注入強制指令 (Prompt Injection)
            user_message_with_instruction = (
                f"{request.message}\n\n"
                "【系統監控】：請判斷用戶意圖。\n"
                "- 如果他在**提問**或**索取資訊** -> 請直接回答（不要建卡）。\n"
                "- 如果他在**輸出知識**或**總結** -> 請立刻調用 `create_flashcard_tool`。"
            )

            contents = gemini_history + [
                types.Content(role="user", parts=[types.Part.from_text(text=user_message_with_instruction)])
            ]

            # 5. 調用 Gemini
            tools = [types.Tool(function_declarations=[get_flashcard_tool_declaration()])]
            response = genai_client.models.generate_content(
                model=MODEL_NAME,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    tools=tools,
                    temperature=0.3,
                )
            )

            # =================================================
            # 🔥 Gemini 2.0 回覆解析邏輯 (過濾 Thinking) 🔥
            # =================================================
            final_text = ""
            function_called = False
            
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    
                    # A. 處理工具調用 (Function Call)
                    if part.function_call:
                        fn_name = part.function_call.name
                        logger.info(f"⚡ Function call detected: {fn_name}")
                        
                        if fn_name == "create_flashcard_tool":
                            args = part.function_call.args
                            # 兼容 args 為 dict 或 object 的情況
                            front = args.get("front") if isinstance(args, dict) else getattr(args, "front", "")
                            back = args.get("back") if isinstance(args, dict) else getattr(args, "back", "")
                            
                            result = execute_create_flashcard(
                                front=front, back=back,
                                user_id=request.user_id,
                                tree_id=request.tree_id,
                                node_id=request.node_context.get("id")
                            )
                            
                            function_called = True
                            if result["status"] == "success":
                                final_text += f"\n\n(✨ 系統提示：已為您生成閃卡！正面：{front})"
                            else:
                                final_text += f"\n\n(⚠️ 系統提示：閃卡創建失敗 - {result.get('error')})"

                    # B. 處理普通文本 (Text) - 過濾掉 Thought
                    elif hasattr(part, "text") and part.text:
                        final_text += part.text
                    
                    # C. 忽略 Thought 類型

            # 6. 兜底回應
            if not final_text.strip():
                if function_called:
                    final_text = "重點我幫你記下來了！(✨ 系統生成閃卡)"
                else:
                    logger.warning("⚠️ Model returned empty response without tool call.")
                    final_text = "（AI 似乎正在深度思考，請試著繼續你的思路...）"

            return {"reply": final_text}

        except errors.ServerError as e:
            if e.code == 503 and attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"⚠️ Chat Model overloaded (503). Retrying in {delay:.2f}s... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
                continue
            else:
                logger.exception("Chat endpoint ServerError")
                return JSONResponse(status_code=503, content={"message": "AI 服務暫時過載，請稍後再試"})
        except Exception as e:
            logger.exception("Chat endpoint error")
            return JSONResponse(status_code=500, content={"message": str(e)})
    
    # 如果所有重試都失敗了
    return JSONResponse(status_code=503, content={"message": "AI 服務暫時不可用，請稍後再試"})

@app.post("/transcribe-audio", dependencies=[Depends(verify_api_key)])
async def transcribe_audio(file: UploadFile = File(...)):
    """語音轉文字端點 - 支援英文、中文和粵語，包含重試機制"""
    max_retries = 3
    base_delay = 2  # 基礎等待秒數
    
    try:
        logger.info(f"🎙️ Processing audio file: {file.filename} ({file.content_type})")
        
        # 讀取音頻文件的 bytes
        audio_bytes = await file.read()
        
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")
        
        # 構建 Prompt
        prompt = "請逐字轉錄這段語音。語音可能是英文、中文或粵語（廣東話）。請忽略語氣詞，直接輸出轉錄後的純文字，不要加任何開場白。"
        
        # 使用 Gemini 1.5 Flash 進行語音轉錄，包含重試機制
        for attempt in range(max_retries):
            try:
                contents = [
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_text(text=prompt),
                            types.Part.from_bytes(data=audio_bytes, mime_type=file.content_type)
                        ]
                    )
                ]
                
                response = genai_client.models.generate_content(
                    model="gemini-2.0-flash",  # 使用 1.5 Flash，處理音頻穩定且便宜
                    contents=contents
                )
                
                if response.text:
                    transcribed_text = response.text.strip()
                    logger.info(f"✅ Audio transcription successful: {transcribed_text[:50]}...")
                    return {"text": transcribed_text}
                else:
                    logger.warning("⚠️ Gemini returned empty transcription")
                    if attempt == max_retries - 1:
                        raise HTTPException(status_code=500, detail="Transcription failed - empty response")
                    continue
                    
            except errors.ServerError as e:
                if e.code == 503:  # Model overloaded
                    delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                    logger.warning(f"⚠️ Model overloaded (503). Retrying in {delay:.1f}s... (attempt {attempt + 1}/{max_retries})")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(delay)
                        continue
                    else:
                        raise HTTPException(
                            status_code=503, 
                            detail="語音轉錄服務暫時過載，請稍後再試"
                        )
                else:
                    logger.error(f"❌ Server error during transcription: {e}")
                    raise HTTPException(status_code=500, detail=f"轉錄服務錯誤: {str(e)}")
                    
            except errors.ClientError as e:
                logger.error(f"❌ Client error during transcription: {e}")
                raise HTTPException(status_code=400, detail=f"音頻格式錯誤: {str(e)}")
                
            except Exception as e:
                logger.error(f"❌ Unexpected error during transcription attempt {attempt + 1}: {e}")
                if attempt == max_retries - 1:
                    raise HTTPException(status_code=500, detail=f"轉錄失敗: {str(e)}")
                
                # 對於其他錯誤也進行重試，但延遲較短
                delay = 1 * (attempt + 1)
                await asyncio.sleep(delay)
                continue
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Audio transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)