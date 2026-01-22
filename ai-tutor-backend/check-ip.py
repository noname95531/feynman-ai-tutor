import requests

try:
    print("正在檢查 Python 的網絡出口 IP...")
    # 訪問一個可以顯示 IP 的網站
    response = requests.get('https://ipinfo.io/json', timeout=10)
    data = response.json()
    
    print("=" * 30)
    print(f"IP 地址: {data.get('ip')}")
    print(f"所在城市: {data.get('city')}")
    print(f"所在國家: {data.get('country')}")
    print("=" * 30)
    
    if data.get('country') in ['HK', 'CN']:
        print("❌ 警告：你的 Python 仍然在香港/中國網絡環境！")
        print("請檢查 Surfshark 是否已連接，並嘗試切換伺服器。")
    else:
        print("✅ 狀態良好：Python 已通過 VPN (位於海外)。")
        
except Exception as e:
    print(f"❌ 檢測失敗: {e}")
    print("這表示 Python 完全無法連網，可能是 VPN 鎖死了網絡（Kill Switch）。")