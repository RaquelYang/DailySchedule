# 今日行程 DailySchedule

純前端的單頁 PWA，用來管理今天與明天的時間軸行程，以及跨日期的全域 Todo。資料只存在使用者瀏覽器的 `localStorage`，不需要後端服務。

## 功能

- 以 06:00-24:00 時間軸檢視今日或明日行程。
- 新增、編輯、刪除行程，支援顏色、備註與重疊提醒。
- 長按行程卡片後上下拖曳，可用 30 分鐘為單位調整時段。
- 管理全域 Todo，支援開始/結束日期時間、優先級、備註、完成狀態與清除已完成項目。
- 已排程的 Todo 會同步顯示在對應日期的時間軸上。
- 支援安裝為 PWA，並透過 Service Worker 快取 App Shell 供離線載入。

## 專案結構

```text
.
|-- index.html             # App DOM 結構與 PWA metadata
|-- styles.css             # 全站版面、行程卡片、Todo、Dialog 與 RWD 樣式
|-- script.js              # 資料儲存、日期切換、表單、渲染與拖曳互動
|-- service-worker.js      # App Shell 快取與離線 fallback
|-- manifest.webmanifest   # PWA manifest
`-- icons/                 # PWA icon
```

## 本機開發

這個專案沒有建置步驟，也沒有 npm 依賴。直接用靜態伺服器啟動即可：

```bash
python3 -m http.server 8000
```

然後開啟：

```text
http://localhost:8000/
```

不要直接用 `file://` 測 PWA 行為；`script.js` 會在 `file:` 協定下略過 Service Worker 註冊。

## 驗證

修改 JavaScript 後，先做語法檢查：

```bash
node --check script.js
```

提交前也建議確認 diff 沒有多餘空白或非預期檔案：

```bash
git diff --check
git status --short
```

## 資料儲存

- 行程與 Todo 儲存在目前瀏覽器的 `localStorage`，key 為 `dailySchedule.v1`。
- 行程依日期存在 `days[YYYY-MM-DD]`。
- Todo 存在全域 `todos` 陣列，可選擇排程日期與時間。
- 清除網站資料、換瀏覽器或換裝置後，資料不會自動同步或復原。

## PWA 快取與發版規則

此專案的 `service-worker.js` 使用 cache-first 策略快取 App Shell。修改會被快取的程式或資源時，必須同步更新快取版本，避免已安裝的 PWA 一直載入舊檔案。

發版前請檢查：

- 修改 `script.js` 時，同步更新 `index.html` 與 `service-worker.js` 內的 `script.js?v=...`。
- 修改 `styles.css` 時，同步更新 `index.html` 與 `service-worker.js` 內的 `styles.css?v=...`。
- 修改任何 App Shell 快取資源時，遞增 `service-worker.js` 的 `CACHE_NAME`，例如 `daily-schedule-v38` 改為 `daily-schedule-v39`。
- 確認 `APP_SHELL` 內所有檔案都已部署且可存取，否則 `cache.addAll()` 會失敗，新的 Service Worker 無法完成安裝。

已開啟的桌面或手機 PWA 可能先載入舊快取；新版通常會在使用者重新整理，或完全關閉 PWA 後再次開啟時生效。iOS 可能延後 Service Worker 更新檢查。
