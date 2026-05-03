# 保安警察第一總隊・員工內網系統 — 專案背景與開發紀錄

## 專案概述

這是一個給**保安警察第一總隊**內部使用的員工內網系統，部署在 Vercel，後端使用 Supabase。
系統名稱：`三大二中員工內網系統`（對外顯示為「保安警察第一總隊」）

**GitHub Repo：** `Andy666-sss/employee-intranet`
**部署：** Vercel（git push main 後自動觸發）
**後端：** Supabase（PostgreSQL + Auth + Storage）

---

## 技術棧

| 項目 | 版本 / 說明 |
|------|------------|
| 前端框架 | React 19 + Vite |
| 樣式 | Tailwind CSS v4（`@import "tailwindcss"`）+ inline style |
| 字型 | Noto Sans TC（Google Fonts，全站套用） |
| 後端 | Supabase（Auth、PostgreSQL、Storage） |
| 部署 | Vercel（main branch auto-deploy） |

---

## 帳號等級系統

| Level | 稱號 | 權限 |
|-------|------|------|
| 1 | 牛馬 | 基本瀏覽（班表、留言板、業務資料庫） |
| 2 | 社畜 | 同上 + 可上傳業務資料 |
| 3 | 管理員 | 全部功能 + 帳號審核 + 可看匿名真名 + 重設密碼 |

---

## 頁面結構（側邊欄導覽）

```
src/
├── App.jsx                    # 主架構：固定 200px 海軍藍側邊欄
├── pages/
│   ├── LoginPage.jsx          # 登入頁（含臘腸狗LOGO）
│   ├── RegisterPage.jsx       # 申請帳號頁
│   ├── PendingPage.jsx        # 審核等待頁
│   ├── SchedulePage.jsx       # 班表（Excel上傳、格子點擊修改）
│   ├── MessageBoard.jsx       # 心情留言板（匿名、回覆、刪除）
│   ├── KnowledgeBasePage.jsx  # 業務資料庫（主要頁面，見下）
│   ├── AdminApprovalPage.jsx  # 帳號審核（管理員專屬）
│   └── ProfilePage.jsx        # 個人設定（修改密碼）
```

---

## 設計系統（Design Tokens）

```js
const C = {
  navy800: '#1B3A5C',   // 側邊欄背景
  navy700: '#1E4D7B',   // hover 狀態
  navy600: '#2563A8',   // 強調色、按鈕
  navy100: '#E0EAF5',
  pageBg:  '#F5F3EE',   // 奶油色頁面背景（全站）
  cardBg:  '#FFFFFF',
  border:  '#E5E2DC',   // 卡片邊框
  text1:   '#2C2C2C',   // 主要文字
  text2:   '#6B6B6B',   // 次要文字
  shadow1: '0 2px 8px rgba(0,0,0,0.07)',   // 卡片陰影
  shadow2: '0 4px 16px rgba(0,0,0,0.11)',  // hover 陰影
}
```

**側邊欄規格：**
- 寬度：200px，固定（`position: fixed`）
- 背景：`#1B3A5C`
- Logo：圓形臘腸狗圖片（`/logo.jfif`），位於頂部
- 底部：使用者頭像（首字母）+ 姓名 + 等級 + 登出按鈕
- 主內容區：`marginLeft: 200px`

---

## Supabase 資料表

### `profiles`
- `id` (UUID, FK → auth.users)
- `level` (int, 1/2/3)
- `name` (text)
- `is_locked` (boolean)

### `employees`
- `id`, `name`, `badge_number`, `title`, `user_id` (FK → auth.users)

### `pending_registrations`
- `id`, `auth_user_id`, `self_name`, `phone_last3`, `status` (pending/approved/rejected)

### `messages`
- `id`, `user_id`, `content`, `is_anonymous`, `parent_id` (自引用，null = 主留言), `created_at`

### `knowledge_base`
- `id`, `title`, `description` (文字內容 or HTML code)
- `category` (分類名稱)
- `file_url` (JSON 字串，見下方說明)
- `item_type` ('file' | 'html')
- `user_id` (上傳者)
- `created_at`

### `login_attempts`
- `username`, `attempts`, `is_locked`

---

## 業務資料庫（KnowledgeBasePage）重點技術

### 附件格式（file_url 欄位）
**三種向下相容格式：**
```js
// 1. 舊格式：純 URL 字串
"https://xxx.supabase.co/storage/v1/object/public/business_files/xxx"

// 2. 舊格式：JSON URL 陣列
["https://...", "https://..."]

// 3. 新格式：JSON 物件陣列（含原始檔名）
[{ url: "https://...", name: "中文檔名.pdf" }, ...]
```

`parseFileEntries(fileUrlField)` 函式處理三種格式的解析。

### 中文檔名上傳問題（已解決）
**問題：** Supabase Storage 不接受非 ASCII 路徑（如 `1234_吉卜賽.pdf`），會報 `Invalid key` 錯誤。
**解法：** 儲存路徑用 ASCII 安全名（`file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')`），原始中文檔名另存在 JSON 的 `name` 欄位。

```js
async function uploadFile(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const filePath = `${Date.now()}_${safeName}`
  // 上傳時用 safeName，顯示時用 file.name
  return { url: publicUrl, name: file.name }
}
```

### HTML 互動網頁類型
`item_type = 'html'` 時，`description` 欄位存放完整 HTML 程式碼，瀏覽時用 `<iframe srcdoc>` 渲染。

**iframe 安全設定：**
```jsx
<iframe
  srcdoc={injectNavFix(item.description)}
  sandbox="allow-scripts allow-same-origin"
/>
```

**`injectNavFix(html)` 的必要性：**
`allow-same-origin` 讓 JS 能操作 DOM（tab 切換等），但同時使 `<a href="#">` 會解析為主應用程式的 URL，點擊後會把整個 React app 載入到 iframe 裡。
`injectNavFix` 在 HTML 前注入一個 capture-phase 事件監聽器，攔截 `href="#"` 和 `href="javascript:..."` 的導航，改為 `scrollIntoView`，onclick 事件仍正常執行。

---

## 登入安全機制

- 登入失敗 5 次 → 帳號自動鎖定（`login_attempts` 表 + `record_login_failure` RPC）
- 管理員可在「帳號審核」頁解除鎖定（`unlock_account` RPC）
- 管理員可重設任意使用者密碼（`admin_reset_password` RPC）
- 帳號格式：不含 `@` 則自動補 `@intranet.app` 假網域

---

## 業務資料庫分類與顏色

```js
const CATEGORIES = [
  { name: '人事業務',     bg: 'bg-blue-100',   text: 'text-blue-700' },
  { name: '警務業務',     bg: 'bg-red-100',    text: 'text-red-700' },
  { name: '督訓業務',     bg: 'bg-orange-100', text: 'text-orange-700' },
  { name: '後勤業務',     bg: 'bg-green-100',  text: 'text-green-700' },
  { name: '保防業務',     bg: 'bg-purple-100', text: 'text-purple-700' },
  { name: '秘書、資訊業務', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { name: '分隊長',       bg: 'bg-yellow-100', text: 'text-yellow-700' },
  { name: '其他',         bg: 'bg-gray-100',   text: 'text-gray-600' },
]
```

---

## 重要注意事項

1. **Tailwind v4** 使用 `@import "tailwindcss"` 而非 `@tailwind base/components/utilities`
2. **Supabase RLS**：`knowledge_base` 表需要設定 UPDATE/DELETE policy，讓 `user_id = auth.uid()` 或 level >= 3 的使用者可以操作
3. **`knowledge_base` 必要欄位：**
   ```sql
   ALTER TABLE knowledge_base ADD COLUMN item_type TEXT NOT NULL DEFAULT 'file';
   ALTER TABLE knowledge_base ADD COLUMN user_id UUID REFERENCES auth.users(id);
   ```
4. **圖片資源：** `public/logo.jfif`（臘腸狗LOGO）供登入頁與側邊欄使用

---

## LOGO 說明

`public/logo.jfif` — 保安警察第一總隊員工內網 LOGO，圓形徽章設計，深藍底色，中間為臘腸狗頭像，上方文字「保安警察第一總隊」，下方「員工內網」。

使用位置：
- `LoginPage.jsx`：登入表單上方，`w-28 h-28 rounded-full`
- `App.jsx`（Logo 元件）：側邊欄頂部，`w-100 h-100 rounded-full`

---

## 開發流程

```bash
# 本地開發
cd C:\Users\吉掰\Desktop\1spc\employee-intranet
npm run dev

# 部署（直接 push，Vercel 自動觸發）
git add -A
git commit -m "..."
git push origin main
```
