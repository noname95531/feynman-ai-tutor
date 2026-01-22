"""
學習知識樹生成器 (Learning Tree Generator)
使用 Google Gemini API (新版 SDK) 生成結構化的學習知識樹
"""

import json
import os
import re
from typing import List, Dict, Optional
from pathlib import Path

# 新版 SDK 導入
from google import genai
from google.genai import types

def load_env_file():
    """從 .env 文件加載環境變量 (支援 UTF-8 和 UTF-16)"""
    env_file = Path(__file__).parent / ".env"
    if env_file.exists():
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                parse_env_lines(f)
        except UnicodeDecodeError:
            try:
                with open(env_file, "r", encoding="utf-16") as f:
                    parse_env_lines(f)
            except Exception:
                pass

def parse_env_lines(f):
    """解析環境變量行"""
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip('"\'')

def validate_tree_structure(nodes: List[Dict]) -> None:
    """驗證樹結構的有效性"""
    if not nodes:
        raise ValueError("生成失敗：節點列表為空")
    
    # 檢查是否有根節點
    root_nodes = [n for n in nodes if n.get("parentId") is None]
    if len(root_nodes) != 1:
        raise ValueError(f"結構錯誤：必須有且僅有一個根節點 (parentId=null)，但發現了 {len(root_nodes)} 個")
    
    # 檢查孤立節點
    node_ids = {node["id"] for node in nodes}
    for node in nodes:
        if node["parentId"] is not None and node["parentId"] not in node_ids:
            print(f"警告：節點 '{node['label']}' (ID: {node['id']}) 的父節點 '{node['parentId']}' 不存在，可能導致斷連。")

def generate_learning_tree(topic: str) -> List[Dict[str, Optional[str]]]:
    """生成學習知識樹的核心函數"""
    load_env_file()
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("錯誤：找不到 GEMINI_API_KEY，請檢查 .env 文件。")
    
    client = genai.Client(api_key=api_key)
    
    # --- 關鍵修改：強化的 Prompt，強制要求深層結構 ---
    prompt = f"""
    你是一位專業的計算機科學課程設計師。請為主題 "{topic}" 生成一個**多層級的學習知識樹**。

    【核心要求 - 必須嚴格遵守】
    1. **結構必須有深度**：絕不允許生成扁平的列表。必須包含至少 3 個層級：
       - Level 1: 根節點 (Root)
       - Level 2: 主要章節 (Chapters) - 至少 3 個
       - Level 3: 具體知識點 (Topics) - 每個章節下至少 2-3 個
    2. **連接關係**：Level 3 的節點必須連接到 Level 2 的節點，不能直接連到 Root。
    3. **返回格式**：純 JSON 對象，格式為 {{ "nodes": [...] }}。

    【JSON 字段定義】
    - id: 唯一標識符 (string, 使用英文蛇形命名，如 "binary_tree_traversal")
    - label: 顯示名稱 (string, 繁體中文)
    - description: 簡短描述 (string, 繁體中文, 30-50字)
    - parentId: 父節點的 ID (string, 根節點為 null)

    【示例結構參考】
    Root (id: "py_root")
      ├── 變數與類型 (id: "vars", parentId: "py_root")
      │     ├── 整數 (id: "int", parentId: "vars")
      │     └── 字符串 (id: "str", parentId: "vars")
      └── 控制流 (id: "flow", parentId: "py_root")
            ├── If語句 (id: "if_stmt", parentId: "flow")
            └── 循環 (id: "loops", parentId: "flow")
    
    請現在為 "{topic}" 生成約 15-20 個節點的完整樹狀結構 JSON。
    """

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3, # 降低隨機性，讓結構更穩定
                response_mime_type="application/json"
            )
        )
        
        # 提取內容
        content = response.text if hasattr(response, 'text') else str(response)
        
        # 清理 Markdown (防止 ```json 包裹)
        content = re.sub(r'```json\s*', '', content)
        content = re.sub(r'```\s*$', '', content)
        
        # 解析 JSON
        parsed = json.loads(content)
        
        # 兼容性處理：有些模型會直接返回 list，有些返回 dict
        nodes = []
        if isinstance(parsed, dict) and "nodes" in parsed:
            nodes = parsed["nodes"]
        elif isinstance(parsed, list):
            nodes = parsed
        else:
            # 嘗試尋找 dict 中的 list
            for val in parsed.values():
                if isinstance(val, list):
                    nodes = val
                    break
            if not nodes:
                raise ValueError("無法解析 API 返回的 JSON 結構")

        validate_tree_structure(nodes)
        return nodes
        
    except Exception as e:
        raise RuntimeError(f"API 調用或解析失敗: {str(e)}")

if __name__ == "__main__":
    target_topic = "Python Basics"
    print(f"正在生成 '{target_topic}' 的學習知識樹 (使用 Gemini)...\n")
    
    try:
        tree = generate_learning_tree(target_topic)
        
        # 打印結果
        print(json.dumps(tree, ensure_ascii=False, indent=2))
        
        # 簡單的層級分析
        print("\n" + "="*30)
        print("結構深度分析：")
        root = next(n for n in tree if n['parentId'] is None)
        level2 = [n for n in tree if n['parentId'] == root['id']]
        level3 = [n for n in tree if n['parentId'] in [l2['id'] for l2 in level2]]
        
        print(f"- 根節點: {root['label']}")
        print(f"- 第二層節點 (章節): {len(level2)} 個")
        print(f"- 第三層節點 (知識點): {len(level3)} 個")
        
        if len(level3) > 0:
            print("✅ 成功！結構包含三層深度，不再是扁平的蜘蛛網了。")
        else:
            print("⚠️ 警告：結構似乎仍然不夠深，建議改用 gemini-1.5-pro 重試。")
            
        print("="*30)

    except Exception as e:
        print(f"發生錯誤: {e}")