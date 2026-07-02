import { STORAGE_KEY } from "./config.js";

export function createEmptyStore() {
  return { version: 1, days: {}, todos: [] };
}

export function createStorageController(showStorageNotice) {
  let storageAvailable = true;
  let store = loadStore();

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyStore();

      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !parsed.days || typeof parsed.days !== "object") {
        throw new Error("Unsupported storage format");
      }
      if (!Array.isArray(parsed.todos)) parsed.todos = [];
      return parsed;
    } catch (error) {
      storageAvailable = false;
      showStorageNotice("無法讀取瀏覽器內的既有行程。為避免覆蓋資料，本次變更不會永久保存。");
      return createEmptyStore();
    }
  }

  function saveStore() {
    if (!storageAvailable) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      storageAvailable = false;
      showStorageNotice("瀏覽器無法保存行程。請確認未停用網站儲存空間，並避免使用限制儲存的瀏覽模式。");
      return false;
    }
  }

  function getEvents(dateKey) {
    const events = store.days[dateKey];
    return Array.isArray(events) ? events : [];
  }

  function setEvents(dateKey, events) {
    store.days[dateKey] = events;
    saveStore();
  }

  function getTodos() {
    return Array.isArray(store.todos) ? store.todos : [];
  }

  function setTodos(todos) {
    store.todos = todos;
    saveStore();
  }

  return {
    getStore: () => store,
    getEvents,
    setEvents,
    getTodos,
    setTodos,
    saveStore,
  };
}
