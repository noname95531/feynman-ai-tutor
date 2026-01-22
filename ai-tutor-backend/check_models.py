import os
from google import genai
from pathlib import Path

def load_env_file():
    """從 .env 文件加載環境變量 (支援 UTF-8 和 UTF-16)"""
    env_file = Path(__file__).parent / ".env"
    if env_file.exists():
        # 嘗試 UTF-8
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                parse_env_lines(f)
        except UnicodeDecodeError:
            # 如果失敗，嘗試 UTF-16
            try:
                with open(env_file, "r", encoding="utf-16") as f:
                    parse_env_lines(f)
            except Exception as e:
                print(f"無法讀取 .env 文件: {e}")

def parse_env_lines(f):
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            # 移除引號並設置環境變量
            os.environ[key.strip()] = value.strip('"\'')

def check_connection():
    load_env_file()
    api_key = os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        print("❌ 錯誤: 找不到 GEMINI_API_KEY，請檢查 .env 文件")
        return

    # === 網絡代理設置區域 ===
    # 如果你的 VPN 開啟了但 Python 仍然連不上，請取消下面兩行的註釋
    # 並將 7890 改為你 VPN 的端口 (常見: 7890, 1080, 10809)
    # os.environ["HTTP_PROXY"] = "http://127.0.0.1:7890" 
    # os.environ["HTTPS_PROXY"] = "http://127.0.0.1:7890"
    # ========================

    print(f"🔑 正在使用 API Key: {api_key[:5]}...{api_key[-3:]}")
    print("🌐 正在連接 Google 伺服器查詢可用模型...")
    
    try:
        client = genai.Client(api_key=api_key)
        
        # 列出所有模型
        models = list(client.models.list())
        
        print("\n✅ 連接成功！你的 API Key 可以訪問以下模型：")
        print("=" * 40)
        found_flash = False
        for m in models:
            # 只顯示生成式模型
            if "generateContent" in m.supported_generation_methods:
                print(f"- {m.name}")
                if "gemini-1.5-flash" in m.name:
                    found_flash = True
        print("=" * 40)

        if not found_flash:
            print("\n⚠️ 警告: 列表中沒有找到 'gemini-1.5-flash'。")
            print("這通常意味著你的 IP 地址仍被識別為香港/中國地區。")
            print("請檢查你的 VPN 是否開啟了「全局模式」 (Global Mode)。")
        else:
            print("\n🎉 狀態良好: 發現 Flash 模型！")
            print("你可以去運行 python test_tree.py 了。")

    except Exception as e:
        print(f"\n❌ 連接失敗: {e}")
        print("提示：請檢查 VPN 是否開啟，或是否需要設置代理端口。")

if __name__ == "__main__":
    check_connection()