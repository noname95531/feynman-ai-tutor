# API 安全設置指南

本指南說明如何為 AI Tutor App 設置 API 密鑰驗證。

## 概述

為了保護後端 API 免受未授權訪問，我們實施了一個簡單的 API 密鑰驗證機制。所有對後端的請求都必須包含正確的 `X-API-SECRET` header。

## 設置步驟

### 1. 後端設置 (FastAPI)

編輯現有的 `ai-tutor-backend/.env` 文件，添加以下行：
```env
# API Security
INTERNAL_API_SECRET=your_custom_secret_key_here
```

**重要**: 請使用一個強密碼，不要使用默認值 `my_super_secret_password`。

### 2. 前端設置 (Next.js)

編輯現有的 `.env.local` 文件，添加以下行：
```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_SECRET=your_custom_secret_key_here
```

**注意**: 前端和後端的密鑰必須完全一致。

### 3. 重啟服務

設置完成後，重啟前端和後端服務：

```bash
# 重啟後端
cd ai-tutor-backend
python main.py

# 重啟前端
cd ..
npm run dev
```

## 受保護的端點

以下 API 端點現在需要 `X-API-SECRET` header：

- `POST /chat` - AI 聊天
- `POST /generate-tree` - 生成學習樹
- `POST /sync-note` - 同步筆記
- `POST /process-file` - 處理文件
- `POST /transcribe-audio` - 語音轉錄

## 公開端點

以下端點不需要驗證：

- `GET /health` - 健康檢查

## 安全建議

1. **使用強密碼**: 生成一個至少 32 字符的隨機密鑰
2. **定期更換**: 建議定期更換 API 密鑰
3. **環境隔離**: 在不同環境（開發、測試、生產）使用不同的密鑰
4. **不要提交**: 確保 `.env` 和 `.env.local` 文件不會被提交到版本控制

## 生成安全密鑰

你可以使用以下方法生成安全的 API 密鑰：

### Python
```python
import secrets
print(secrets.token_urlsafe(32))
```

### Node.js
```javascript
const crypto = require('crypto');
console.log(crypto.randomBytes(32).toString('base64'));
```

### 在線工具
訪問 https://www.uuidgenerator.net/api/version4 或類似的在線密鑰生成器。

## 故障排除

### 403 Forbidden 錯誤
如果收到 403 錯誤，請檢查：
1. 前端和後端的 `INTERNAL_API_SECRET` / `NEXT_PUBLIC_API_SECRET` 是否一致
2. 環境變量是否正確加載
3. 是否重啟了服務

### 環境變量未加載
1. 確認文件名正確（`.env` 和 `.env.local`）
2. 確認文件位置正確
3. 重啟開發服務器

## 配置管理改進

我們已經實施了統一的 API 配置管理：

### 配置文件 (`lib/config.ts`)
```typescript
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export const getAPIHeaders = () => ({
  'Content-Type': 'application/json',
  'X-API-SECRET': process.env.NEXT_PUBLIC_API_SECRET || '',
});
```

### 環境變量
在 `.env.local` 中設置：
```env
NEXT_PUBLIC_API_URL=http://localhost:8000  # 開發環境
# NEXT_PUBLIC_API_URL=https://your-api.domain.com  # 生產環境
NEXT_PUBLIC_API_SECRET=your_secret_key
```

### 優勢
1. **統一管理**: 所有 API 調用都使用 `apiRequest()` 函數
2. **環境切換**: 只需修改 `NEXT_PUBLIC_API_URL` 即可切換環境
3. **自動認證**: API 密鑰自動添加到所有請求
4. **類型安全**: TypeScript 支持和錯誤檢查

## 進一步增強

如需更高級的安全功能，可以考慮：
1. JWT 令牌認證
2. API 速率限制
3. IP 白名單
4. OAuth 2.0 集成