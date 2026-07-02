# 專案開發規則

## PWA 發版與快取更新

- 此專案透過 `service-worker.js` 快取 App Shell，採用 cache-first 策略。
- 使用者開啟桌面 PWA 時，頁面可能先載入舊快取；新版 Service Worker 會在背景安裝並透過 `skipWaiting()` 立即啟用，但已開啟的頁面不會自動重新載入。
- 新版程式通常會在使用者重新整理，或完全關閉 PWA 後再次開啟時生效。iOS 可能延後 Service Worker 的更新檢查。
- 每次修改會被快取的程式或資源時，必須同步遞增 `service-worker.js` 中的 `CACHE_NAME`，例如 `daily-schedule-v7` 改為 `daily-schedule-v8`。
- 修改 `script.js`、`styles.css`、`src/js/*` 或 `src/css/*` 時，也必須更新 `APP_SHELL` 內 entrypoint URL 的查詢版本，例如 `script.js?v=4` 改為 `script.js?v=5`，並確認新增分檔有列入 `APP_SHELL`。
- 發版前確認 `APP_SHELL` 中所有檔案均已部署且可存取，否則 `cache.addAll()` 失敗會導致新 Service Worker 無法完成安裝。
