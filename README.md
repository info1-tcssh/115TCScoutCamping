# 第41屆行義蘭姐童軍專科考驗暨聯團露營報名及檔案上傳系統

本系統為專為**臺中市第41屆行義蘭姐童軍專科考驗暨聯團露營**設計的整合型報名與檔案繳交管理平台。本著現代化、響應式與安全性至上的設計原則，本系統提供各校童軍代表與大會管理員一個直覺、高效且安全的無紙化工作流。

---

## 🚀 系統核心功能 (Features Architecture)

本系統採 **單一頁面應用程式 (SPA)** 架構，並具備高度優化的交互與狀態管理設計。系統依據角色（各校代表與大會管理員）劃分為兩大核心操作維度：

### 1. 學校代表端 (School Representative Portal)
* **身分註冊與教育網域驗證 (.edu Domain Verification)**：
  * 僅開放具有教育組織網域（包含 `.edu`、教育部教育雲 `@mail.edu.tw`、臺中市教育局 `@tc.edu.tw` 或各校教育機構帳號）之 Google 帳號進行代表註冊。
  * 若使用非教育帳號（如 `@gmail.com`），系統自動鎖定註冊表單並呈現明確指引與一鍵「切換 Google 學校教育帳號再試」之導引功能。
  * 嚴格維持一般參賽學校「一校一代表」的資料完整性（主辦單位臺中二中除外）。
* **代表資料自我管理 (Profile Management)**：已登入代表可隨時修正聯絡人名稱、聯絡電話及備註事項。
* **四項必備資料上傳 (單檔嚴格限制 2MB)**：
  * **家長同意書**
  * **緊急聯絡名冊**
  * **專科考驗報名表**
  * **活動繳費證明**
  * *容量與損毀防護*：單檔限制 2MB，可完全防範 Google Apps Script 傳輸容量上限被截斷成 4 位元組損毀檔案的問題。
* **即時進度追蹤 (Progress Tracking)**：直覺的視覺進度條與狀態燈號（已繳交、未繳交、格式不符），讓代表隨時掌握文件審查進度。

### 2. 大會管理員後台 (Admin Command Center)
* **大會數據儀表板 (Analytics Dashboard)**：即時匯總全台中市各參賽學校的總繳交進度、已繳齊學校名冊與未繳齊學校清單。
* **主辦學校多代表支援 (Multi-Representative Support for Host School)**：
  * 主辦單位**臺中二中 (編號 55)** 支援多位行政與工作人員同時註冊為代表。
  * 後台總表會自動標記「多位代表 (X位)」徽章，並將多位代表之姓名、電話與 Email 以獨立清單並列排版，支援個別代表資料編輯與單一帳號解除綁定。
* **考驗檔案審核與回饋**：
  * **一鍵快速下載**學校繳交的檔案。
  * **即時批改狀態**（可核定為「合格」或標記為「不合格，需補件」）。
  * **備註與指導意見**：提供即時欄位讓管理員寫下退件理由（例如：家長同意書漏蓋章），系統將即時反映給該校代表。
* **學校帳號生命週期管理**：可手動新增代表、編輯各校代表資訊，或刪除離職/誤登的代表帳號。
* **全系統安全稽核日誌 (Security Audit Logs)**：系統會詳細記錄管理員與代表的每一次重要操作（如帳號修改、檔案批改、狀態重設），並附帶時間戳記，以供未來溯源備查。

---

## 🛠️ 技術棧與工具鏈 (Technical Stack)

本系統採用現代化前端架構，追求零冗餘、高效能與極致的型別安全。

* **前端框架**：`React 19` (最新穩定版，採用函數式組件與豐富的自定義 Hooks 控制狀態)
* **構建工具**：`Vite 6` (極速開發熱更新與高度優化的生產環境 Bundle 壓縮)
* **程式語言**：`TypeScript` (全系統實施嚴格的型別檢查，杜絕運行時 Null 指標錯誤)
* **樣式解決方案**：`Tailwind CSS v4` (高效、敏捷的 utility-first 樣式框架，支援細緻的響應式斷點與流暢的動態過渡效果)
* **資料持久化與同步**：`Firebase Firestore` (提供無伺服器、高併發的實時 NoSQL 資料庫支援)
* **動畫與微交互**：`Motion` (原 framer-motion，為對話框、錯誤提示氣泡及狀態轉換注入流暢的物理學過渡動畫)
* **圖標庫**：`Lucide React` (高對比度、符合現代化視覺美學的 SVG 圖標集)

---

## 🔒 安全防護與格式驗證機制 (Security & Validation Schemes)

作為一款公開的報名與檔案收集平台，系統在資料輸入與持久化儲存層實施了多重的防禦與檢驗機制，確保系統免於受惡意攻擊。

### 1. XSS (跨網站指令碼) 與 HTML 注入防禦
* **雙重過濾過濾器 (Secondary Sanitization)**：
  在使用者提交資料的**前端 UI 層**與**雲端資料存取層 (Storage Service)** 均實作了嚴格的 `sanitizeInput` 檢查。
  * **原理**：利用正則表達式 `/<[^>]*>/g` 全域比對、過濾並剝除任何潛藏在代表姓名、備註與檔案名稱中的 HTML 標籤。
  * **防禦成效**：徹底阻絕惡意攻擊者透過輸入框植入 `<script>` 腳本、`<iframe>` 或外連惡意網頁。

### 2. 精準且具高容錯度的台灣聯絡電話驗證 (Regex Checking)
考量到各校行政人員可能有市話、手機或處室分機等多樣化需求，系統建置了極具彈性的 Regex 檢查演算法：
* **前綴限制**：必須以合法的台灣電話號碼格式開頭，如 `0` (代表市話或手機) 或 `+886`/`886` (國際國碼)。其正則運算式為 `/^(\+?886|0)/`。
* **字元白名單**：除數字外，僅容許半形數字、`-`、`+`、`#`（分機分隔符）、`()`（區碼括號）與空格。其正則運算式為 `/^[0-9\s\-\(\)\+#ext\+]+$/i`。
* **長度合理性檢查**：系統在背景提取純數字，驗證其總位數必須介於 **9 至 16 碼** 之間。這既能防範空號 (如 `09-`) 繞過，亦保留了行政分機長度（如 `#123`）的填寫空間。

### 3. 表單互動性防錯優化 (UX & Error Handling)
* **局部高亮與即時重設**：若電話格式不符，系統**絕不關閉代表的編輯視窗**，而是將電話輸入框瞬間轉為紅框警告、字體加粗，並在點擊修改時即時清除紅框，避免打斷使用者輸入。
* **物理彈跳警示氣泡 (Tooltip)**：在儲存按鈕上方同步彈出一個帶有微小物理彈跳動畫的紅色警告氣泡，指引使用者修正格式，優化傳統 Modal 彈窗干擾操作的缺點。

### 4. 教育組織網域 (.edu) 白名單註冊驗證
為防範非學校公務代表隨意註冊學校，並確保通訊公信力，系統在註冊前端與寫入層實施網域白名單校驗：
* **合規網域**：網域必須包含 `.edu`（包含教育部教育雲 `@mail.edu.tw`、臺中市教育局 `@tc.edu.tw`、大專院校與各級高國中小 `@*.edu.tw` / `@*.edu`）。
* **阻斷防護與引導**：非教育帳號（如個人 `@gmail.com`）進入註冊時，系統將自動鎖定表單並顯示允許網域清單，提供一鍵切換 Google 教育帳號再試之快捷按鈕。

---

## 📂 專案結構 (Directory Structure)

```text
├── src/
│   ├── components/            # 核心視圖與 React 組件
│   │   ├── UserRegisterView.tsx   # 各校代表註冊模組 (含 XSS 過濾、電話正則驗證)
│   │   └── AppSimulator.tsx       # 系統主入口：代表儀表板、檔案管理、大會管理員後台、日誌系統
│   ├── data/
│   │   └── schools.ts             # 臺中市高中職學校静態名冊 (SCHOOLS 陣列)
│   ├── lib/
│   │   ├── firebase.ts            # Firebase SDK 初始化設定
│   │   └── security.ts            # 全域安全工具箱 (XSS 過濾、台灣電話正則驗證核心)
│   ├── services/
│   │   └── storageService.ts      # 資料持久化存取服務層 (整合 Firestore 與防禦機制的雙重校驗)
│   ├── types.ts                   # 全系統 TypeScript 型別、結構與列舉定義
│   ├── index.css                  # 全域樣式與 Tailwind CSS 導入
│   └── App.tsx                    # 應用程式根組件
├── package.json                   # 依賴套件定義與 npm 指令設定
├── tsconfig.json                  # TypeScript 編譯設定檔
└── vite.config.ts                 # Vite 構建外掛與環境配置
```

---

## ☁️ Google 雲端硬碟與 GAS 整合架構 (Google Drive & GAS Integration)

為了克服網頁端短暫 OAuth Token 的過期限制，並提供不中斷的流暢上傳與刪除體驗，本系統支援兩種上傳架構。本系統與 Google 雲端生態系的關係如下：

```text
 學校代表上傳檔案/刪除檔案 ──> 本系統 (React App)
                                   │
                                   ├──> [模式 A] 直連 Google Drive API v3 (需要管理員在當前 Session 中透過 Google 登入授權)
                                   │
                                   └──> [模式 B] 呼叫 Google Apps Script (GAS) Web App API (免除使用者登入，以大會身分代理操作)
                                                       │
                                                       └──> 自動建立/刪除/搬移檔案 ──> 大會指定 Google Drive 資料夾
```

### 1. 系統運作核心與 Google 生態系串接關係：
* **Google Apps Script (GAS)**：
  大會部署的一段 Apps Script（程式碼模板位於 `src/data/gasCode.ts`），將其發佈為 **Web App** 形式。本系統做為前端，透過 POST 請求將檔案資料（Base64 格式）與刪除指令（`action: 'delete'`）傳送至 GAS 網址，GAS 則會以「大會管理員之 Google 帳號身分」在目標資料夾內執行建立檔案、開放權限（設為任何人皆可檢視，防範權限限閱問題）或移至垃圾桶（刪除）等行為。
* **Google 雲端硬碟指定資料夾**：
  大會管理員在系統設定介面中填入「**Google Drive 資料夾 ID**」及「**GAS 網址**」。所有學校代表繳交的四項檔案，在成功寫入系統 Firebase Firestore 紀錄的同時，亦會同步備份上傳至此雲端硬碟資料夾。

### 2. GAS 傳輸上限與 4 位元組檔案損毀防護 (Payload Safeguard)
* **傳輸限制成因**：Google Apps Script (GAS) 網路應用程式在處理 POST 請求時有約 3MB 的 Payload 隱性容量限制。若上傳檔案過大，傳輸將在中途遭到截斷，導致 Base64 解析為 `"null"` 或空內容，進而在雲端硬碟中生成 4 位元組的無效損毀檔案。
* **雙重防護機制**：
  1. **前端嚴格控管 (2MB Limit)**：系統在代表選擇檔案與送出時，全面落實單一檔案 2MB 限制，從源頭確保 Base64 編碼後仍在 GAS 安全傳輸範圍內。
  2. **GAS 端嚴格校驗**：GAS 程式碼（`src/data/gasCode.ts`）在接收到資料後，會驗證 Base64 與解碼後的 Byte 長度，若異常則即時中斷並拋出明確錯誤，絕不在雲端硬碟中寫入任何殘缺檔案。

---

## 🧑‍💻 續接開發人員設定指引 (Onboarding & Environments Setup)

若您是接手本系統的新開發人員，或大會需要重置/遷移至新的 Google 與 Firebase 帳號，請務必按照以下指引完成各平台的配置：

### 1. AI Studio / 本地端環境變數配置 (`.env.example` 與 Secrets)
在 Google AI Studio 開發或本地執行時，系統依賴 Firebase 資料庫及 Google API。請確認以下設定：
* 在本地開發時，需建立 `.env` 檔案（可參考 `.env.example` 格式）。
* **重要**：請確認 `firebase-applet-config.json`（存放於專案根目錄）包含正確的 Firebase Web 設定金鑰及 `oAuthClientId`，這對於初始化 Cloud Firestore 與執行 Google 登入功能至關重要。

### 2. Firebase Console (Firestore 實時資料庫設定)
本系統所有註冊紀錄、上傳紀錄與系統日誌皆儲存於 Firebase Firestore。
* 進入 [Firebase Console](https://console.firebase.google.com/)。
* 啟用 **Cloud Firestore**（模式：生產模式，並部署專案根目錄下的 `firestore.rules` 規則以維護資料安全）。
* 在 Firestore 建立三個核心集合（Collection）：
  * `users`：儲存各校代表註冊資訊。
  * `schoolFiles`：儲存已上傳檔案的中介詮釋資料（Metadata）、下載連結與對應之 `driveFileId`。
  * `auditLogs`：儲存所有大會管理與代表操作的稽核日誌。
  * `systemSettings`：儲存系統設定，包含 Google Drive 設定與自訂表件下載設定。

### 3. Google Cloud Console (OAuth 同意畫面與憑證)
若欲啟用「管理員直連 Google Drive 進行上傳與刪除檔案」功能：
* 進入 [Google Cloud Console](https://console.cloud.google.com/)。
* 在「API 和服務」中啟用 **Google Drive API**。
* 設定「OAuth 同意畫面」，將應用程式註冊為內部或外部，並新增以下 Scope：
  * `https://www.googleapis.com/auth/drive.file`
* 在「憑證」中建立 **OAuth 2.0 用戶端 ID (Client ID)**，應用程式類型選擇「網頁應用程式」。
* **重要設定**：在「已授權的 JavaScript 來源」中，加入您在 AI Studio 的開發預覽網址（例如 `https://ais-dev-*.run.app` 與生產部署網址）。
* 將產生的 **Client ID** 設定於系統後台，或寫入專案的 `firebase-applet-config.json` 中。

### 4. Google Apps Script 部署指引（最重要：保障代表順暢上傳與刪除）
為使學校代表上傳與刪除不受 Google 登入 token 的 1 小時過期限制困擾，必須正確部署 GAS：
1. 複製專案中 `src/data/gasCode.ts` 的完整程式碼。
2. 造訪 [Google Apps Script 官網](https://script.google.com/)，登入並建立一個新專案，將程式碼貼入 `代碼.gs` 中並儲存。
3. **部署設定（極為重要，否則會發生 CORS 跨網域封鎖錯誤）**：
   * 點擊右上角「**部署**」>「**新增部署**」。
   * 選取部署類型為「**網路應用程式 (Web App)**」。
   * **執行身分 (Execute as)**：務必選擇「**我 (Me)**」（即大會管理員帳號）。
   * **誰有權限存取 (Who has access)**：務必選擇「**所有人 (Anyone)**」（不可選擇「僅限我自己」或「機構內的所有人」，否則學校代表上傳時會被導向 Google 登入頁面並遭 CORS 錯誤封鎖）。
4. 點擊「部署」後，會跳出「授予存取權」提示，請點擊並同意帳號授權。
5. **複製 Web App URL**（網址應以 `/exec` 結尾，**絕對不能使用編輯器中的 `/edit` 網址**）。
6. **大會管理員後台設定**：
   * 以管理員身分登入本系統（管理員 Email 設定於 `src/services/storageService.ts` 的 `DEFAULT_ADMINS` 中）。
   * 進入大會「系統設定」，將複製的 **GAS Web App 網址** 與 準備好的 **Google Drive 雲端硬碟資料夾 ID**（雲端資料夾網址中的 `/folders/後方一長串代碼`）貼入並點擊儲存，即可同步更新至 Firebase 資料庫，供所有代表使用。

> 💡 **資安與組織帳號限制提醒**：
> 若您使用學校或教育局官方 Google 組織帳號（例如 `@cloud.tcssh.tc.edu.tw` 等機構帳號）部署 GAS，學校的資安政策（Workspace Admin）通常會強制封鎖外部匿名者的存取權限，即使您在 GAS 介面勾選了「所有人 (Anyone)」仍會造成上傳或刪除失敗。
> **【解決方案】**：強烈建議使用**個人的一般 Gmail 帳號** (`@gmail.com`) 來建立 GAS 專案並進行部署，此方法能確保 100% 開放外部匿名存取，並能完美與本系統串接運作！

---

## 💻 本地端開發與部署指南 (Deployment & Development)

### 1. 安裝相依套件
在專案根目錄下執行以下指令以安裝所需套件：
```bash
npm install
```

### 2. 本地開發伺服器啟動
啟動本地 Vite 開發伺服器：
```bash
npm run dev
```
啟動後，您可於瀏覽器造訪 [http://localhost:3000](http://localhost:3000) 進行即時開發與偵錯。

### 3. 生產環境編譯 (Build)
將應用程式打包編譯為高度壓縮的最佳化 SPA：
```bash
npm run build
```
編譯產物將輸出至 `/dist` 目錄，可直接部署至任何靜態託管平台（如 Netlify, Cloud Run 等）。

### 4. 程式碼規範校驗 (Linter)
在提交程式碼前，建議執行 TypeScript 靜態檢查：
```bash
npm run lint
```

---

## 📝 系統授權與致謝
本系統為專屬臺中市第 41 屆行義蘭姐童軍專科考驗設計之數位化轉型解決方案，由臺中二中社團組與大會技術組聯合維護。如有系統異常、刪除帳號需求，請逕洽臺中二中。
