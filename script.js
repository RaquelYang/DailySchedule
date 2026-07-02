(() => {
  "use strict";

  const STORAGE_KEY = "dailySchedule.v1";
  const START_HOUR = 6;
  const END_HOUR = 24;
  const MINUTES_PER_DAY_VIEW = (END_HOUR - START_HOUR) * 60;
  const TIME_STEP = 30;
  const LONG_PRESS_DELAY = 450;
  const MOVE_TOLERANCE = 8;
  const VALID_COLORS = new Set(["green", "red", "blue"]);
  const VALID_TODO_PRIORITIES = new Set(["high", "medium", "low"]);
  const VALID_MOBILE_PANELS = new Set(["schedule", "todo"]);
  const TODO_PRIORITY_LABELS = {
    high: "高",
    medium: "中",
    low: "低",
  };
  const TODO_PRIORITY_RANKS = {
    high: 0,
    medium: 1,
    low: 2,
  };

  const elements = {
    appShell: document.querySelector(".app-shell"),
    workspaceLayout: document.querySelector("#workspace-layout"),
    appTitle: document.querySelector("#app-title"),
    todayLabel: document.querySelector("#today-label"),
    dateToggleButton: document.querySelector("#date-toggle-button"),
    scheduleCard: document.querySelector(".schedule-card"),
    eventCount: document.querySelector("#event-count"),
    timeline: document.querySelector("#timeline"),
    timelineGrid: document.querySelector("#timeline-grid"),
    eventsLayer: document.querySelector("#events-layer"),
    currentTimeLine: document.querySelector("#current-time-line"),
    currentTimeLabel: document.querySelector("#current-time-label"),
    dragTimeIndicator: document.querySelector("#drag-time-indicator"),
    dragTimeValue: document.querySelector("#drag-time-value"),
    storageNotice: document.querySelector("#storage-notice"),
    dialog: document.querySelector("#event-dialog"),
    form: document.querySelector("#event-form"),
    dialogTitle: document.querySelector("#dialog-title"),
    title: document.querySelector("#event-title"),
    start: document.querySelector("#event-start"),
    end: document.querySelector("#event-end"),
    notes: document.querySelector("#event-notes"),
    formError: document.querySelector("#form-error"),
    conflictWarning: document.querySelector("#conflict-warning"),
    addButton: document.querySelector("#add-event-button"),
    closeButton: document.querySelector("#close-dialog-button"),
    cancelButton: document.querySelector("#cancel-button"),
    infoButton: document.querySelector("#info-button"),
    infoDialog: document.querySelector("#info-dialog"),
    closeInfoButton: document.querySelector("#close-info-dialog-button"),
    confirmInfoButton: document.querySelector("#confirm-info-dialog-button"),
    todoDialog: document.querySelector("#todo-dialog"),
    todoForm: document.querySelector("#todo-form"),
    todoDialogTitle: document.querySelector("#todo-dialog-title"),
    todoTitle: document.querySelector("#todo-title"),
    todoDate: document.querySelector("#todo-date"),
    todoEndDate: document.querySelector("#todo-end-date"),
    todoStart: document.querySelector("#todo-start"),
    todoEnd: document.querySelector("#todo-end"),
    todoNotes: document.querySelector("#todo-notes"),
    todoFormError: document.querySelector("#todo-form-error"),
    addTodoButton: document.querySelector("#add-todo-button"),
    closeTodoButton: document.querySelector("#close-todo-dialog-button"),
    todoSubmitButton: document.querySelector("#todo-submit-button"),
    cancelTodoEditButton: document.querySelector("#cancel-todo-edit-button"),
    clearCompletedTodosButton: document.querySelector("#clear-completed-todos-button"),
    todoCount: document.querySelector("#todo-count"),
    todoEmptyState: document.querySelector("#todo-empty-state"),
    todoList: document.querySelector("#todo-list"),
    mobilePanelButtons: document.querySelectorAll(".mobile-panel-button"),
  };

  let storageAvailable = true;
  let store = loadStore();
  let currentDateKey = getLocalDateKey();
  let viewDateKey = currentDateKey;
  let editingId = null;
  let editingTodoId = null;
  let mobilePanel = "schedule";
  let dragState = null;
  let suppressClickUntil = 0;
  let pageScrollLocked = false;
  let lockedScrollY = 0;

  function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function shiftDateKey(dateKey, days) {
    const date = parseDateKey(dateKey);
    date.setDate(date.getDate() + days);
    return getLocalDateKey(date);
  }

  function createEmptyStore() {
    return { version: 1, days: {}, todos: [] };
  }

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

  function showStorageNotice(message) {
    elements.storageNotice.textContent = message;
    elements.storageNotice.hidden = false;
  }

  function getEvents() {
    const events = store.days[viewDateKey];
    return Array.isArray(events) ? events : [];
  }

  function setEvents(events) {
    store.days[viewDateKey] = events;
    saveStore();
  }

  function getTodos() {
    return Array.isArray(store.todos) ? store.todos : [];
  }

  function setTodos(todos) {
    store.todos = todos;
    saveStore();
  }

  function timeToMinutes(time) {
    if (time === "24:00") return END_HOUR * 60;
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match) return Number.NaN;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function minutesToTime(totalMinutes) {
    if (totalMinutes === END_HOUR * 60) return "24:00";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function populateTimeOptions() {
    const startFragment = document.createDocumentFragment();
    const endFragment = document.createDocumentFragment();

    for (let minutes = START_HOUR * 60; minutes <= END_HOUR * 60; minutes += TIME_STEP) {
      const time = minutesToTime(minutes);
      if (minutes < END_HOUR * 60) startFragment.append(new Option(time, time));
      if (minutes > START_HOUR * 60) endFragment.append(new Option(time, time));
    }

    elements.start.append(startFragment);
    elements.end.append(endFragment);
  }

  function populateTodoTimeOptions() {
    const startFragment = document.createDocumentFragment();
    const endFragment = document.createDocumentFragment();
    startFragment.append(new Option("不指定", ""));
    endFragment.append(new Option("不指定", ""));

    for (let minutes = START_HOUR * 60; minutes <= END_HOUR * 60; minutes += TIME_STEP) {
      const time = minutesToTime(minutes);
      if (minutes < END_HOUR * 60) startFragment.append(new Option(time, time));
      if (minutes > START_HOUR * 60) endFragment.append(new Option(time, time));
    }

    elements.todoStart.append(startFragment);
    elements.todoEnd.append(endFragment);
  }

  function removeLegacyTimeOptions() {
    elements.start.querySelectorAll("option[data-legacy]").forEach((option) => option.remove());
    elements.end.querySelectorAll("option[data-legacy]").forEach((option) => option.remove());
  }

  function ensureTimeOption(select, time) {
    if ([...select.options].some((option) => option.value === time)) return;

    const option = new Option(time, time);
    option.dataset.legacy = "true";
    const nextOption = [...select.options].find((item) => timeToMinutes(item.value) > timeToMinutes(time));
    select.insertBefore(option, nextOption || null);
  }

  function buildTimelineGrid() {
    const fragment = document.createDocumentFragment();
    for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
      const row = document.createElement("div");
      row.className = "hour-row";
      row.style.top = `calc(var(--hour-height) * ${hour - START_HOUR})`;
      row.innerHTML = `<span class="hour-label">${String(hour).padStart(2, "0")}:00</span><span class="half-hour-line"></span>`;
      fragment.append(row);
    }

    const endRow = document.createElement("div");
    endRow.className = "hour-row end-hour-row";
    endRow.style.top = `calc(var(--hour-height) * ${END_HOUR - START_HOUR})`;
    endRow.innerHTML = `<span class="hour-label">${String(END_HOUR).padStart(2, "0")}:00</span>`;
    fragment.append(endRow);
    elements.timelineGrid.append(fragment);
  }

  const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  function formatDateKey(dateKey) {
    return dateFormatter.format(parseDateKey(dateKey));
  }

  function getViewRelation() {
    if (viewDateKey === currentDateKey) return "today";
    if (viewDateKey === shiftDateKey(currentDateKey, 1)) return "tomorrow";
    if (viewDateKey === shiftDateKey(currentDateKey, -1)) return "yesterday";
    return "other";
  }

  function getViewTitle() {
    const relation = getViewRelation();
    if (relation === "today") return "今日行程";
    if (relation === "tomorrow") return "明日行程";
    if (relation === "yesterday") return "昨日行程";
    return `${formatDateKey(viewDateKey)} 行程`;
  }

  function getViewLabel() {
    const relation = getViewRelation();
    const label = relation === "today"
      ? "今天"
      : relation === "tomorrow"
        ? "明天"
        : relation === "yesterday"
          ? "昨天"
          : "";
    return label ? `${label}・${formatDateKey(viewDateKey)}` : formatDateKey(viewDateKey);
  }

  function getDateToggleLabel() {
    return viewDateKey === currentDateKey ? "明天" : "今天";
  }

  function refreshDateHeader() {
    const isTomorrow = getViewRelation() === "tomorrow";
    elements.todayLabel.textContent = getViewLabel();
    elements.dateToggleButton.textContent = getDateToggleLabel();
    elements.dateToggleButton.setAttribute("aria-label", `切換到${getDateToggleLabel()}`);
    elements.dateToggleButton.title = `切換到${getDateToggleLabel()}`;
    elements.scheduleCard.classList.toggle("is-tomorrow", isTomorrow);
  }

  function eventsOverlap(first, second) {
    return timeToMinutes(first.start) < timeToMinutes(second.end)
      && timeToMinutes(second.start) < timeToMinutes(first.end);
  }

  function findConflicts(candidate, excludedId = null) {
    return getEvents().filter((event) => event.id !== excludedId && eventsOverlap(candidate, event));
  }

  function calculateLayout(items) {
    const sorted = [...items].sort((a, b) => {
      return timeToMinutes(a.start) - timeToMinutes(b.start)
        || timeToMinutes(a.end) - timeToMinutes(b.end);
    });
    const layouts = new Map();
    let cluster = [];
    let clusterEnd = -1;

    const flushCluster = () => {
      if (!cluster.length) return;
      const columnEnds = [];
      const assignments = [];

      cluster.forEach((item) => {
        const start = timeToMinutes(item.start);
        let column = columnEnds.findIndex((end) => end <= start);
        if (column === -1) column = columnEnds.length;
        columnEnds[column] = timeToMinutes(item.end);
        assignments.push({ item, column });
      });

      const columnCount = Math.max(columnEnds.length, 1);
      assignments.forEach(({ item, column }) => {
        layouts.set(item.layoutKey, { column, columnCount });
      });
      cluster = [];
      clusterEnd = -1;
    };

    sorted.forEach((item) => {
      const start = timeToMinutes(item.start);
      const end = timeToMinutes(item.end);
      if (cluster.length && start >= clusterEnd) flushCluster();
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, end);
    });
    flushCluster();
    return layouts;
  }

  function createEventCard(event, layout, hasConflict) {
    const start = timeToMinutes(event.start);
    const end = timeToMinutes(event.end);
    const top = ((start - START_HOUR * 60) / 60) * 100;
    const height = ((end - start) / 60) * 100;
    const gap = 6;
    const width = 100 / layout.columnCount;

    const color = VALID_COLORS.has(event.color) ? event.color : "green";
    const card = document.createElement("article");
    card.className = `event-card color-${color}${hasConflict ? " has-conflict" : ""}`;
    card.dataset.eventId = event.id;
    card.style.setProperty("--event-top", `calc(var(--hour-height) * ${top / 100})`);
    card.style.setProperty("--event-height", `calc(var(--hour-height) * ${height / 100})`);
    card.style.setProperty("--event-left", `calc(${width * layout.column}% + ${layout.column * gap}px)`);
    card.style.setProperty("--event-width", `calc(${width}% - ${gap}px)`);

    const notesDescription = event.notes ? `，備註：${event.notes}` : "";
    const conflictDescription = hasConflict ? "，與其他行程時段重疊" : "";
    card.innerHTML = `
      <button class="event-card-main" type="button" aria-label="編輯 ${escapeHtml(event.title)}，${event.start} 到 ${event.end}${escapeHtml(notesDescription)}${conflictDescription}">
        <span class="event-title"></span>
        <span class="event-time">${event.start}–${event.end}${hasConflict ? " · 時段重疊" : ""}</span>
      </button>
      <div class="event-actions">
        <button class="event-action delete" type="button" aria-label="刪除 ${escapeHtml(event.title)}" title="刪除">×</button>
      </div>`;
    card.querySelector(".event-title").textContent = event.title;
    card.title = event.notes || event.title;
    return card;
  }

  function getTodoStartTime(todo) {
    return todo.scheduledStart || todo.scheduledTime || "";
  }

  function getTodoEndTime(todo) {
    const start = timeToMinutes(getTodoStartTime(todo));
    const explicitEnd = todo.scheduledEnd || "";
    if (Number.isFinite(timeToMinutes(explicitEnd))) return explicitEnd;
    if (!Number.isFinite(start)) return "";
    return minutesToTime(Math.min(start + 60, END_HOUR * 60));
  }

  function getTodoEndDate(todo) {
    return todo.scheduledEndDate || todo.scheduledDate || "";
  }

  function getTodoTimeRange(todo) {
    const start = getTodoStartTime(todo);
    const end = getTodoEndTime(todo);
    return { start, end };
  }

  function getTodoVisibleTimeRange(todo) {
    const { start, end } = getTodoTimeRange(todo);
    return {
      start,
      end: getTodoEndDate(todo) === todo.scheduledDate ? end : minutesToTime(END_HOUR * 60),
    };
  }

  function hasScheduledTodoTime(todo) {
    const { start, end } = getTodoVisibleTimeRange(todo);
    return Boolean(todo.scheduledDate && start && end)
      && Number.isFinite(timeToMinutes(start))
      && Number.isFinite(timeToMinutes(end))
      && timeToMinutes(end) > timeToMinutes(start);
  }

  function getScheduledTodosForView() {
    return getTodos()
      .filter((todo) => todo.scheduledDate === viewDateKey && hasScheduledTodoTime(todo))
      .sort((a, b) => timeToMinutes(getTodoStartTime(a)) - timeToMinutes(getTodoStartTime(b))
        || getTodoTimestamp(a.createdAt) - getTodoTimestamp(b.createdAt));
  }

  function createScheduledTodoCard(todo, layout) {
    const priority = getTodoPriority(todo.priority);
    const { start: startTime, end: endTime } = getTodoVisibleTimeRange(todo);
    const endDate = getTodoEndDate(todo);
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    const top = ((start - START_HOUR * 60) / 60) * 100;
    const height = ((end - start) / 60) * 100;
    const gap = 6;
    const width = 100 / layout.columnCount;

    const card = document.createElement("article");
    card.className = `scheduled-todo-card priority-${priority}${todo.completed ? " is-completed" : ""}`;
    card.dataset.todoId = todo.id;
    card.style.setProperty("--todo-top", `calc(var(--hour-height) * ${top / 100})`);
    card.style.setProperty("--todo-height", `calc(var(--hour-height) * ${height / 100})`);
    card.style.setProperty("--todo-left", `calc(${width * layout.column}% + ${layout.column * gap}px)`);
    card.style.setProperty("--todo-width", `calc(${width}% - ${gap}px)`);

    const checkbox = document.createElement("input");
    checkbox.className = "scheduled-todo-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(todo.completed);
    checkbox.setAttribute("aria-label", `${todo.completed ? "標記為未完成" : "標記為完成"}：${todo.title}`);

    const button = document.createElement("button");
    button.className = "scheduled-todo-main";
    button.type = "button";
    button.setAttribute("aria-label", `編輯 Todo：${todo.title}，${todo.scheduledDate} ${startTime} 到 ${endDate} ${getTodoEndTime(todo)}`);

    const title = document.createElement("span");
    title.className = "scheduled-todo-title";
    title.textContent = todo.title;

    const time = document.createElement("span");
    time.className = "scheduled-todo-time";
    time.textContent = `${formatTodoScheduleRange(todo)} · ${TODO_PRIORITY_LABELS[priority]}優先`;

    button.append(title, time);
    card.append(checkbox, button);
    return card;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function getTodoPriority(priority) {
    return VALID_TODO_PRIORITIES.has(priority) ? priority : "medium";
  }

  function getTodoTimestamp(value) {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function formatTodoScheduleRange(todo, includeDate = false) {
    const { start, end } = getTodoTimeRange(todo);
    const endDate = getTodoEndDate(todo);
    if (!todo.scheduledDate || !start || !end) return "";
    if (endDate === todo.scheduledDate) {
      return includeDate ? `${formatDateKey(todo.scheduledDate)} ${start}–${end}` : `${start}–${end}`;
    }
    return `${formatDateKey(todo.scheduledDate)} ${start}–${formatDateKey(endDate)} ${end}`;
  }

  function sortTodos(todos) {
    return [...todos].sort((a, b) => {
      if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
      const priorityDiff = TODO_PRIORITY_RANKS[getTodoPriority(a.priority)] - TODO_PRIORITY_RANKS[getTodoPriority(b.priority)];
      if (priorityDiff) return priorityDiff;
      return getTodoTimestamp(a.createdAt) - getTodoTimestamp(b.createdAt);
    });
  }

  function createTodoItem(todo) {
    const priority = getTodoPriority(todo.priority);
    const item = document.createElement("li");
    item.className = `todo-item priority-${priority}${todo.completed ? " is-completed" : ""}`;
    item.dataset.todoId = todo.id;

    const checkbox = document.createElement("input");
    checkbox.className = "todo-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(todo.completed);
    checkbox.setAttribute("aria-label", `${todo.completed ? "標記為未完成" : "標記為完成"}：${todo.title}`);

    const content = document.createElement("div");
    content.className = "todo-content";

    const title = document.createElement("p");
    title.className = "todo-title";
    title.textContent = todo.title;
    content.append(title);

    const meta = document.createElement("p");
    meta.className = "todo-meta";
    const priorityLabel = document.createElement("span");
    priorityLabel.className = `todo-priority priority-${priority}`;
    priorityLabel.textContent = `${TODO_PRIORITY_LABELS[priority]}優先`;
    meta.append(priorityLabel);
    if (hasScheduledTodoTime(todo)) {
      const scheduleLabel = document.createElement("span");
      scheduleLabel.textContent = formatTodoScheduleRange(todo, true);
      meta.append(scheduleLabel);
    }
    if (todo.completedAt) {
      const completedLabel = document.createElement("span");
      completedLabel.textContent = "已完成";
      meta.append(completedLabel);
    }
    content.append(meta);

    if (todo.notes) {
      const notes = document.createElement("p");
      notes.className = "todo-notes";
      notes.textContent = todo.notes;
      content.append(notes);
    }

    const actions = document.createElement("div");
    actions.className = "todo-actions";
    actions.innerHTML = `
      <button class="todo-action edit" type="button">編輯</button>
      <button class="todo-action delete" type="button">刪除</button>`;
    actions.querySelector(".edit").setAttribute("aria-label", `編輯 ${todo.title}`);
    actions.querySelector(".delete").setAttribute("aria-label", `刪除 ${todo.title}`);

    item.append(checkbox, content, actions);
    return item;
  }

  function renderTodos() {
    const todos = sortTodos(getTodos());
    const fragment = document.createDocumentFragment();
    const completedCount = todos.filter((todo) => todo.completed).length;

    todos.forEach((todo) => fragment.append(createTodoItem(todo)));
    elements.todoList.replaceChildren(fragment);
    elements.todoEmptyState.hidden = todos.length > 0;
    elements.todoCount.textContent = todos.length
      ? `${todos.length} 個待辦・${completedCount} 個完成`
      : "尚無待辦";
    elements.clearCompletedTodosButton.disabled = completedCount === 0;

    if (editingTodoId && !getTodos().some((todo) => todo.id === editingTodoId)) {
      resetTodoForm();
    }
  }

  function clearTodoFormError() {
    elements.todoFormError.hidden = true;
    elements.todoFormError.textContent = "";
  }

  function resetTodoForm() {
    editingTodoId = null;
    elements.todoForm.reset();
    elements.todoForm.elements.priority.value = "medium";
    elements.todoDate.value = "";
    elements.todoEndDate.value = "";
    elements.todoStart.value = "";
    elements.todoEnd.value = "";
    elements.todoDialogTitle.textContent = "新增 Todo";
    elements.todoSubmitButton.textContent = "新增 Todo";
    clearTodoFormError();
  }

  function getTodoCandidate() {
    return {
      title: elements.todoTitle.value.trim(),
      priority: getTodoPriority(elements.todoForm.elements.priority.value),
      scheduledDate: elements.todoDate.value,
      scheduledEndDate: elements.todoEndDate.value,
      scheduledStart: elements.todoStart.value,
      scheduledEnd: elements.todoEnd.value,
      scheduledTime: elements.todoStart.value,
      notes: elements.todoNotes.value.trim(),
    };
  }

  function validateTodoCandidate(candidate) {
    if (!candidate.title) return "請輸入待辦事項。";
    const hasAnyScheduleValue = Boolean(
      candidate.scheduledDate
        || candidate.scheduledEndDate
        || candidate.scheduledStart
        || candidate.scheduledEnd,
    );
    const hasEveryScheduleValue = Boolean(
      candidate.scheduledDate
        && candidate.scheduledEndDate
        && candidate.scheduledStart
        && candidate.scheduledEnd,
    );
    if (hasAnyScheduleValue && !hasEveryScheduleValue) {
      return "如果要排進行程，開始日期、開始時間、結束日期與結束時間都需要選擇。";
    }
    if (Boolean(candidate.scheduledStart) !== Boolean(candidate.scheduledEnd)) {
      return "如果要設定時間，開始與結束時間需要一起選擇。";
    }
    if (hasEveryScheduleValue) {
      const start = timeToMinutes(candidate.scheduledStart);
      const end = timeToMinutes(candidate.scheduledEnd);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return "請選擇有效的 Todo 時間。";
      if (start < START_HOUR * 60 || start >= END_HOUR * 60 || end <= START_HOUR * 60 || end > END_HOUR * 60) {
        return `Todo 時間需介於 ${minutesToTime(START_HOUR * 60)}–${minutesToTime(END_HOUR * 60)}。`;
      }
      const startDate = parseDateKey(candidate.scheduledDate).getTime();
      const endDate = parseDateKey(candidate.scheduledEndDate).getTime();
      if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) return "請選擇有效的 Todo 日期。";
      if (endDate < startDate || (endDate === startDate && end <= start)) {
        return "Todo 結束日期時間必須晚於開始日期時間。";
      }
    }
    return "";
  }

  function syncTodoEndFromStart() {
    if (elements.todoDate.value && !elements.todoEndDate.value) {
      elements.todoEndDate.value = elements.todoDate.value;
    }

    const start = timeToMinutes(elements.todoStart.value);
    const end = timeToMinutes(elements.todoEnd.value);
    if (Number.isFinite(start) && (!Number.isFinite(end) || end <= start)) {
      elements.todoEnd.value = minutesToTime(Math.min(start + 60, END_HOUR * 60));
      if (elements.todoDate.value && !elements.todoEndDate.value) {
        elements.todoEndDate.value = elements.todoDate.value;
      }
    }
  }

  function openCreateTodoDialog() {
    resetTodoForm();
    elements.todoDialog.showModal();
    syncModalState();
    requestAnimationFrame(() => elements.todoTitle.focus());
  }

  function closeTodoDialog() {
    if (elements.todoDialog.open) elements.todoDialog.close();
  }

  function handleTodoDialogClose() {
    resetTodoForm();
    syncModalState();
    render();
  }

  function handleTodoSubmit(event) {
    event.preventDefault();
    const candidate = getTodoCandidate();
    const error = validateTodoCandidate(candidate);
    if (error) {
      elements.todoFormError.textContent = error;
      elements.todoFormError.hidden = false;
      elements.todoTitle.focus();
      return;
    }

    const now = new Date().toISOString();
    const todos = [...getTodos()];
    if (editingTodoId) {
      const index = todos.findIndex((todo) => todo.id === editingTodoId);
      if (index === -1) {
        elements.todoFormError.textContent = "找不到要編輯的 Todo，請重新選擇。";
        elements.todoFormError.hidden = false;
        return;
      }
      todos[index] = { ...todos[index], ...candidate, updatedAt: now };
    } else {
      todos.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...candidate,
        completed: false,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      });
    }

    setTodos(todos);
    resetTodoForm();
    closeTodoDialog();
    renderTodos();
    render();
  }

  function openEditTodo(id) {
    const todo = getTodos().find((item) => item.id === id);
    if (!todo) return;
    editingTodoId = id;
    elements.todoTitle.value = todo.title;
    elements.todoForm.elements.priority.value = getTodoPriority(todo.priority);
    elements.todoDate.value = todo.scheduledDate || "";
    elements.todoEndDate.value = getTodoEndDate(todo);
    elements.todoStart.value = getTodoStartTime(todo);
    elements.todoEnd.value = getTodoEndTime(todo);
    elements.todoNotes.value = todo.notes || "";
    elements.todoDialogTitle.textContent = "編輯 Todo";
    elements.todoSubmitButton.textContent = "儲存修改";
    clearTodoFormError();
    elements.todoDialog.showModal();
    syncModalState();
    requestAnimationFrame(() => elements.todoTitle.focus());
  }

  function toggleTodoCompleted(id) {
    const now = new Date().toISOString();
    const todos = getTodos().map((todo) => {
      if (todo.id !== id) return todo;
      const completed = !todo.completed;
      return {
        ...todo,
        completed,
        completedAt: completed ? now : null,
        updatedAt: now,
      };
    });
    setTodos(todos);
    render();
  }

  function deleteTodo(id) {
    const todo = getTodos().find((item) => item.id === id);
    if (!todo) return;
    if (!window.confirm(`確定要刪除「${todo.title}」嗎？`)) return;
    setTodos(getTodos().filter((item) => item.id !== id));
    if (editingTodoId === id) closeTodoDialog();
    render();
  }

  function clearCompletedTodos() {
    const completedCount = getTodos().filter((todo) => todo.completed).length;
    if (!completedCount) return;
    if (!window.confirm(`確定要清除 ${completedCount} 個已完成 Todo 嗎？`)) return;
    setTodos(getTodos().filter((todo) => !todo.completed));
    if (editingTodoId && !getTodos().some((todo) => todo.id === editingTodoId)) closeTodoDialog();
    render();
  }

  function setMobilePanel(panel) {
    mobilePanel = VALID_MOBILE_PANELS.has(panel) ? panel : "schedule";
    elements.workspaceLayout.dataset.mobilePanel = mobilePanel;
    document.body.dataset.mobilePanel = mobilePanel;
    elements.mobilePanelButtons.forEach((button) => {
      const isActive = button.dataset.mobilePanelTarget === mobilePanel;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    if (mobilePanel === "schedule") updateCurrentTime();
  }

  function render() {
    const events = [...getEvents()].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    const scheduledTodos = getScheduledTodosForView();
    const layoutItems = [
      ...events.map((event) => ({
        layoutKey: `event:${event.id}`,
        start: event.start,
        end: event.end,
      })),
      ...scheduledTodos.map((todo) => {
        const { start, end } = getTodoVisibleTimeRange(todo);
        return {
          layoutKey: `todo:${todo.id}`,
          start,
          end,
        };
      }),
    ];
    const layouts = calculateLayout(layoutItems);
    const fragment = document.createDocumentFragment();

    events.forEach((event) => {
      const hasConflict = events.some((other) => other.id !== event.id && eventsOverlap(event, other));
      fragment.append(createEventCard(event, layouts.get(`event:${event.id}`), hasConflict));
    });

    scheduledTodos.forEach((todo) => {
      fragment.append(createScheduledTodoCard(todo, layouts.get(`todo:${todo.id}`)));
    });

    elements.eventsLayer.replaceChildren(fragment);
    const eventLabel = events.length ? `${events.length} 筆行程` : "尚無行程";
    elements.eventCount.textContent = scheduledTodos.length
      ? `${eventLabel}・${scheduledTodos.length} 個 Todo`
      : eventLabel;
    refreshDateHeader();
    elements.appTitle.textContent = getViewTitle();
    document.title = getViewTitle();
    elements.appShell.setAttribute("data-view-date", viewDateKey);
    updateCurrentTime();
    renderTodos();
  }

  function syncModalState() {
    const modalOpen = elements.dialog.open || elements.todoDialog.open || elements.infoDialog.open;
    if (modalOpen && !pageScrollLocked) {
      lockedScrollY = window.scrollY;
      document.body.style.setProperty("--locked-scroll-offset", `-${lockedScrollY}px`);
      document.documentElement.classList.add("modal-open");
      document.body.classList.add("modal-open");
      pageScrollLocked = true;
    } else if (!modalOpen && pageScrollLocked) {
      document.documentElement.classList.remove("modal-open");
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("--locked-scroll-offset");
      window.scrollTo(0, lockedScrollY);
      pageScrollLocked = false;
    }
  }

  function preventModalBackgroundScroll(event) {
    if (!pageScrollLocked) return;

    const openDialog = [elements.dialog, elements.todoDialog, elements.infoDialog].find((dialog) => dialog.open) || null;
    if (!openDialog) {
      event.preventDefault();
      return;
    }

    const point = event.touches?.[0] || event;
    const rect = openDialog.getBoundingClientRect();
    const insideDialog = point.clientX >= rect.left
      && point.clientX <= rect.right
      && point.clientY >= rect.top
      && point.clientY <= rect.bottom;
    if (!insideDialog) event.preventDefault();
  }

  function getDefaultTimes() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let start = Math.ceil(nowMinutes / TIME_STEP) * TIME_STEP;
    start = Math.max(START_HOUR * 60, Math.min(start, END_HOUR * 60 - TIME_STEP));
    let end = Math.min(start + 60, END_HOUR * 60);
    if (end <= start) end = start + TIME_STEP;
    return { start: minutesToTime(start), end: minutesToTime(end) };
  }

  function openCreateDialog(defaults = getDefaultTimes()) {
    editingId = null;
    removeLegacyTimeOptions();
    elements.form.reset();
    elements.start.value = defaults.start;
    elements.end.value = defaults.end;
    elements.dialogTitle.textContent = "新增行程";
    clearFormMessages();
    elements.dialog.showModal();
    syncModalState();
    requestAnimationFrame(() => elements.title.focus());
  }

  function openCreateDialogAtPosition(pointerEvent) {
    if (pointerEvent.target.closest(".event-card, button")) return;

    const timelineRect = elements.timeline.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(pointerEvent.clientY - timelineRect.top, timelineRect.height));
    const positionMinutes = (relativeY / timelineRect.height) * MINUTES_PER_DAY_VIEW;
    const clickedMinutes = START_HOUR * 60 + positionMinutes;
    const start = Math.max(
      START_HOUR * 60,
      Math.min(Math.round(clickedMinutes / TIME_STEP) * TIME_STEP, END_HOUR * 60 - TIME_STEP),
    );
    const end = Math.min(start + 60, END_HOUR * 60);

    openCreateDialog({
      start: minutesToTime(start),
      end: minutesToTime(end),
    });
  }

  function openEditDialog(id) {
    const event = getEvents().find((item) => item.id === id);
    if (!event) return;
    editingId = id;
    removeLegacyTimeOptions();
    ensureTimeOption(elements.start, event.start);
    ensureTimeOption(elements.end, event.end);
    elements.title.value = event.title;
    elements.start.value = event.start;
    elements.end.value = event.end;
    elements.form.elements.color.value = VALID_COLORS.has(event.color) ? event.color : "green";
    elements.notes.value = event.notes || "";
    elements.dialogTitle.textContent = "編輯行程";
    clearFormMessages();
    updateConflictWarning();
    elements.dialog.showModal();
    syncModalState();
    requestAnimationFrame(() => elements.title.focus());
  }

  function closeDialog() {
    elements.dialog.close();
    editingId = null;
  }

  function handleEventDialogClose() {
    editingId = null;
    syncModalState();
    render();
  }

  function openInfoDialog() {
    elements.infoDialog.showModal();
    syncModalState();
    requestAnimationFrame(() => elements.closeInfoButton.focus());
  }

  function closeInfoDialog() {
    elements.infoDialog.close();
  }

  function clearFormMessages() {
    elements.formError.hidden = true;
    elements.formError.textContent = "";
    elements.conflictWarning.hidden = true;
    elements.conflictWarning.textContent = "";
  }

  function getFormCandidate() {
    return {
      title: elements.title.value.trim(),
      start: elements.start.value,
      end: elements.end.value,
      color: VALID_COLORS.has(elements.form.elements.color.value)
        ? elements.form.elements.color.value
        : "green",
      notes: elements.notes.value.trim(),
    };
  }

  function adjustEndTimeAfterInvalidRange() {
    const start = timeToMinutes(elements.start.value);
    const end = timeToMinutes(elements.end.value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < end) return;

    const adjustedEnd = minutesToTime(Math.min(start + 60, END_HOUR * 60));
    ensureTimeOption(elements.end, adjustedEnd);
    elements.end.value = adjustedEnd;
  }

  function validateCandidate(candidate) {
    if (!candidate.title) return "請輸入行程標題。";
    const start = timeToMinutes(candidate.start);
    const end = timeToMinutes(candidate.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "請選擇有效的開始與結束時間。";
    if (start < START_HOUR * 60 || start >= END_HOUR * 60 || end <= START_HOUR * 60 || end > END_HOUR * 60) {
      return "行程時間必須位於 06:00–24:00。";
    }
    if (end <= start) return "結束時間必須晚於開始時間。";
    return "";
  }

  function updateConflictWarning() {
    const candidate = getFormCandidate();
    const validationError = validateCandidate({ ...candidate, title: candidate.title || "暫定行程" });
    if (validationError) {
      elements.conflictWarning.hidden = true;
      return;
    }

    const conflicts = findConflicts(candidate, editingId);
    elements.conflictWarning.hidden = conflicts.length === 0;
    elements.conflictWarning.textContent = conflicts.length
      ? `此時段與「${conflicts.map((event) => event.title).join("」、「")}」重疊，仍可繼續儲存。`
      : "";
  }

  function handleSubmit(event) {
    event.preventDefault();
    adjustEndTimeAfterInvalidRange();
    const candidate = getFormCandidate();
    const error = validateCandidate(candidate);
    if (error) {
      elements.formError.textContent = error;
      elements.formError.hidden = false;
      if (!candidate.title) elements.title.focus();
      return;
    }

    const now = new Date().toISOString();
    const events = [...getEvents()];
    if (editingId) {
      const index = events.findIndex((item) => item.id === editingId);
      if (index === -1) {
        elements.formError.textContent = "找不到要編輯的行程，請關閉視窗後再試一次。";
        elements.formError.hidden = false;
        return;
      }
      events[index] = { ...events[index], ...candidate, updatedAt: now };
    } else {
      events.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...candidate,
        createdAt: now,
        updatedAt: now,
      });
    }

    setEvents(events);
    closeDialog();
    render();
  }

  function deleteEvent(id) {
    const event = getEvents().find((item) => item.id === id);
    if (!event) return;
    if (!window.confirm(`確定要刪除「${event.title}」嗎？`)) return;
    setEvents(getEvents().filter((item) => item.id !== id));
    render();
  }

  function clearLongPressTimer() {
    if (!dragState?.holdTimer) return;
    window.clearTimeout(dragState.holdTimer);
    dragState.holdTimer = null;
  }

  function beginLongPressDrag({ clientX, clientY, inputId, inputType, captureTarget = null }, card) {
    const event = getEvents().find((item) => item.id === card.dataset.eventId);
    if (!event) return;

    const cardRect = card.getBoundingClientRect();
    const timelineRect = elements.timeline.getBoundingClientRect();
    const duration = timeToMinutes(event.end) - timeToMinutes(event.start);
    const grabOffset = ((clientY - cardRect.top) / timelineRect.height) * MINUTES_PER_DAY_VIEW;

    dragState = {
      inputId,
      inputType,
      card,
      captureTarget,
      eventId: event.id,
      originalStart: timeToMinutes(event.start),
      previewStart: timeToMinutes(event.start),
      duration,
      grabOffset: Math.max(0, Math.min(grabOffset, duration)),
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      active: false,
      movedBeforeActivation: false,
      holdTimer: null,
      autoScrollFrame: null,
    };

    if (captureTarget) captureTarget.setPointerCapture(inputId);
    dragState.holdTimer = window.setTimeout(activateDrag, LONG_PRESS_DELAY);
  }

  function activateDrag() {
    if (!dragState) return;
    dragState.active = true;
    dragState.holdTimer = null;
    dragState.card.classList.add("is-dragging");
    document.body.classList.add("is-dragging-event");
    elements.dragTimeIndicator.hidden = false;
    updateDragPreview(dragState.lastX, dragState.lastY, false);
    dragState.autoScrollFrame = window.requestAnimationFrame(autoScrollDrag);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function updateDragPreview(clientX, clientY, snapToPointer = true) {
    if (!dragState?.active) return;
    const timelineRect = elements.timeline.getBoundingClientRect();

    if (snapToPointer) {
      const pointerMinutes = ((clientY - timelineRect.top) / timelineRect.height) * MINUTES_PER_DAY_VIEW;
      const rawStart = START_HOUR * 60 + pointerMinutes - dragState.grabOffset;
      const snappedStart = Math.round(rawStart / TIME_STEP) * TIME_STEP;
      const latestStart = END_HOUR * 60 - dragState.duration;
      dragState.previewStart = Math.max(START_HOUR * 60, Math.min(snappedStart, latestStart));
    }

    const offsetHours = (dragState.previewStart - START_HOUR * 60) / 60;
    dragState.card.style.setProperty("--event-top", `calc(var(--hour-height) * ${offsetHours})`);

    const previewEnd = dragState.previewStart + dragState.duration;
    elements.dragTimeValue.textContent = `${minutesToTime(dragState.previewStart)}–${minutesToTime(previewEnd)}`;
    elements.dragTimeIndicator.style.setProperty("--drag-tip-left", `${Math.max(78, Math.min(clientX, window.innerWidth - 78))}px`);
    elements.dragTimeIndicator.style.setProperty("--drag-tip-top", `${Math.max(92, clientY - 10)}px`);
  }

  function autoScrollDrag() {
    if (!dragState?.active) return;
    const edge = 86;
    let speed = 0;
    if (dragState.lastY < edge) speed = -Math.ceil((edge - dragState.lastY) / 7);
    if (dragState.lastY > window.innerHeight - edge) {
      speed = Math.ceil((dragState.lastY - (window.innerHeight - edge)) / 7);
    }
    if (speed) {
      window.scrollBy(0, speed);
      updateDragPreview(dragState.lastX, dragState.lastY);
    }
    dragState.autoScrollFrame = window.requestAnimationFrame(autoScrollDrag);
  }

  function updatePendingDrag(clientX, clientY) {
    if (!dragState) return;
    dragState.lastX = clientX;
    dragState.lastY = clientY;
    const distance = Math.hypot(clientX - dragState.startX, clientY - dragState.startY);

    if (!dragState.active && distance > MOVE_TOLERANCE) {
      dragState.movedBeforeActivation = true;
      clearLongPressTimer();
    }
  }

  function handleDragPointerDown(pointerEvent) {
    if (pointerEvent.pointerType === "touch" || pointerEvent.button !== 0 || dragState) return;
    const mainButton = pointerEvent.target.closest(".event-card-main");
    const card = mainButton?.closest(".event-card");
    if (!mainButton || !card) return;
    beginLongPressDrag({
      clientX: pointerEvent.clientX,
      clientY: pointerEvent.clientY,
      inputId: pointerEvent.pointerId,
      inputType: "pointer",
      captureTarget: mainButton,
    }, card);
  }

  function handleDragPointerMove(pointerEvent) {
    if (!dragState || dragState.inputType !== "pointer" || pointerEvent.pointerId !== dragState.inputId) return;
    updatePendingDrag(pointerEvent.clientX, pointerEvent.clientY);
    if (!dragState.active) return;

    pointerEvent.preventDefault();
    updateDragPreview(pointerEvent.clientX, pointerEvent.clientY);
  }

  function finishDrag(cancelled = false) {
    if (!dragState) return;
    clearLongPressTimer();
    const finishedState = dragState;

    if (finishedState.autoScrollFrame) window.cancelAnimationFrame(finishedState.autoScrollFrame);
    if (finishedState.captureTarget?.hasPointerCapture(finishedState.inputId)) {
      finishedState.captureTarget.releasePointerCapture(finishedState.inputId);
    }

    if (finishedState.active) {
      suppressClickUntil = Date.now() + 700;
      if (!cancelled && finishedState.previewStart !== finishedState.originalStart) {
        const events = [...getEvents()];
        const index = events.findIndex((item) => item.id === finishedState.eventId);
        if (index !== -1) {
          events[index] = {
            ...events[index],
            start: minutesToTime(finishedState.previewStart),
            end: minutesToTime(finishedState.previewStart + finishedState.duration),
            updatedAt: new Date().toISOString(),
          };
          setEvents(events);
        }
      }
    } else if (finishedState.movedBeforeActivation) {
      suppressClickUntil = Date.now() + 700;
    }

    finishedState.card.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging-event");
    elements.dragTimeIndicator.hidden = true;
    dragState = null;
    if (finishedState.active) render();
  }

  function handleDragPointerEnd(pointerEvent, cancelled = false) {
    if (!dragState || dragState.inputType !== "pointer" || pointerEvent.pointerId !== dragState.inputId) return;
    finishDrag(cancelled);
  }

  function findTrackedTouch(touchList) {
    if (!dragState || dragState.inputType !== "touch") return null;
    return Array.from(touchList).find((touch) => touch.identifier === dragState.inputId) || null;
  }

  function handleDragTouchStart(touchEvent) {
    if (dragState) {
      if (dragState.inputType === "touch" && touchEvent.touches.length > 1) finishDrag(true);
      return;
    }
    if (touchEvent.touches.length !== 1) return;
    const mainButton = touchEvent.target.closest(".event-card-main");
    const card = mainButton?.closest(".event-card");
    const touch = touchEvent.changedTouches[0];
    if (!mainButton || !card || !touch) return;
    beginLongPressDrag({
      clientX: touch.clientX,
      clientY: touch.clientY,
      inputId: touch.identifier,
      inputType: "touch",
    }, card);
  }

  function handleDragTouchMove(touchEvent) {
    if (!dragState || dragState.inputType !== "touch") return;
    if (touchEvent.touches.length !== 1) {
      finishDrag(true);
      return;
    }
    const touch = findTrackedTouch(touchEvent.touches);
    if (!touch) return;
    updatePendingDrag(touch.clientX, touch.clientY);
    if (!dragState.active) return;

    if (touchEvent.cancelable) touchEvent.preventDefault();
    updateDragPreview(touch.clientX, touch.clientY);
  }

  function handleDragTouchEnd(touchEvent, cancelled = false) {
    if (!dragState || dragState.inputType !== "touch") return;
    if (!findTrackedTouch(touchEvent.changedTouches)) return;
    finishDrag(cancelled);
  }

  function cancelDrag() {
    if (dragState) finishDrag(true);
  }

  function updateCurrentTime() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const inRange = viewDateKey === currentDateKey
      && minutes >= START_HOUR * 60
      && minutes < END_HOUR * 60;
    elements.currentTimeLine.hidden = !inRange;
    if (!inRange) return;

    const offsetHours = (minutes - START_HOUR * 60) / 60;
    elements.currentTimeLine.style.setProperty("--current-top", `calc(var(--hour-height) * ${offsetHours})`);
    elements.currentTimeLabel.textContent = minutesToTime(minutes);
  }

  function refreshDateIfNeeded() {
    const nextDate = getLocalDateKey();
    if (nextDate !== currentDateKey) {
      currentDateKey = nextDate;
      render();
      return;
    }
    refreshDateHeader();
    elements.appTitle.textContent = getViewTitle();
    document.title = getViewTitle();
    updateCurrentTime();
  }

  elements.addButton.addEventListener("click", () => openCreateDialog());
  elements.dateToggleButton.addEventListener("click", () => {
    viewDateKey = viewDateKey === currentDateKey
      ? shiftDateKey(currentDateKey, 1)
      : currentDateKey;
    if (elements.dialog.open) closeDialog();
    render();
  });
  document.addEventListener("wheel", preventModalBackgroundScroll, { capture: true, passive: false });
  document.addEventListener("touchmove", preventModalBackgroundScroll, { capture: true, passive: false });
  elements.timeline.addEventListener("dblclick", openCreateDialogAtPosition);
  elements.closeButton.addEventListener("click", closeDialog);
  elements.cancelButton.addEventListener("click", closeDialog);
  elements.infoButton.addEventListener("click", openInfoDialog);
  elements.closeInfoButton.addEventListener("click", closeInfoDialog);
  elements.confirmInfoButton.addEventListener("click", closeInfoDialog);
  elements.form.addEventListener("submit", handleSubmit);
  elements.addTodoButton.addEventListener("click", openCreateTodoDialog);
  elements.closeTodoButton.addEventListener("click", closeTodoDialog);
  elements.todoForm.addEventListener("submit", handleTodoSubmit);
  elements.todoTitle.addEventListener("input", clearTodoFormError);
  elements.todoDate.addEventListener("input", () => {
    if (elements.todoDate.value) elements.todoEndDate.value = elements.todoDate.value;
    clearTodoFormError();
  });
  elements.todoEndDate.addEventListener("input", clearTodoFormError);
  [elements.todoStart, elements.todoEnd].forEach((element) => {
    element.addEventListener("change", () => {
      syncTodoEndFromStart();
      clearTodoFormError();
    });
  });
  elements.cancelTodoEditButton.addEventListener("click", closeTodoDialog);
  elements.clearCompletedTodosButton.addEventListener("click", clearCompletedTodos);
  elements.mobilePanelButtons.forEach((button) => {
    button.addEventListener("click", () => setMobilePanel(button.dataset.mobilePanelTarget));
  });
  elements.todoList.addEventListener("change", (event) => {
    if (!event.target.matches(".todo-checkbox")) return;
    const item = event.target.closest(".todo-item");
    if (item) toggleTodoCompleted(item.dataset.todoId);
  });
  elements.todoList.addEventListener("click", (event) => {
    const item = event.target.closest(".todo-item");
    if (!item) return;
    if (event.target.closest(".edit")) openEditTodo(item.dataset.todoId);
    if (event.target.closest(".delete")) deleteTodo(item.dataset.todoId);
  });
  [elements.start, elements.end].forEach((element) => {
    element.addEventListener("change", () => {
      adjustEndTimeAfterInvalidRange();
      updateConflictWarning();
    });
  });
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) closeDialog();
  });
  elements.dialog.addEventListener("close", handleEventDialogClose);
  elements.todoDialog.addEventListener("click", (event) => {
    if (event.target === elements.todoDialog) closeTodoDialog();
  });
  elements.todoDialog.addEventListener("close", handleTodoDialogClose);
  elements.infoDialog.addEventListener("click", (event) => {
    if (event.target === elements.infoDialog) closeInfoDialog();
  });
  elements.infoDialog.addEventListener("close", syncModalState);
  elements.eventsLayer.addEventListener("pointerdown", handleDragPointerDown);
  elements.eventsLayer.addEventListener("pointermove", handleDragPointerMove);
  elements.eventsLayer.addEventListener("pointerup", (event) => handleDragPointerEnd(event));
  elements.eventsLayer.addEventListener("pointercancel", (event) => handleDragPointerEnd(event, true));
  elements.eventsLayer.addEventListener("touchstart", handleDragTouchStart, { passive: true });
  elements.eventsLayer.addEventListener("touchmove", handleDragTouchMove, { passive: false });
  elements.eventsLayer.addEventListener("touchend", (event) => handleDragTouchEnd(event));
  elements.eventsLayer.addEventListener("touchcancel", (event) => handleDragTouchEnd(event, true));
  elements.eventsLayer.addEventListener("contextmenu", (event) => {
    if (dragState?.inputType === "touch" && event.target.closest(".event-card-main")) event.preventDefault();
  });
  elements.eventsLayer.addEventListener("change", (event) => {
    if (!event.target.matches(".scheduled-todo-checkbox")) return;
    const card = event.target.closest(".scheduled-todo-card");
    if (card) toggleTodoCompleted(card.dataset.todoId);
  });
  elements.eventsLayer.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) return;
    const scheduledTodoCard = event.target.closest(".scheduled-todo-card");
    if (scheduledTodoCard && !event.target.closest(".scheduled-todo-checkbox")) {
      openEditTodo(scheduledTodoCard.dataset.todoId);
      return;
    }
    const card = event.target.closest(".event-card");
    if (!card) return;
    if (event.target.closest(".delete")) deleteEvent(card.dataset.eventId);
    else openEditDialog(card.dataset.eventId);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelDrag();
    else refreshDateIfNeeded();
  });
  window.addEventListener("blur", cancelDrag);
  window.addEventListener("focus", refreshDateIfNeeded);

  populateTimeOptions();
  populateTodoTimeOptions();
  buildTimelineGrid();
  setMobilePanel("schedule");
  render();
  window.setInterval(refreshDateIfNeeded, 60_000);

  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    });
  }
})();
