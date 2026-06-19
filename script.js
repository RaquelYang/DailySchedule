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

  const elements = {
    appShell: document.querySelector(".app-shell"),
    todayLabel: document.querySelector("#today-label"),
    eventCount: document.querySelector("#event-count"),
    timeline: document.querySelector("#timeline"),
    timelineGrid: document.querySelector("#timeline-grid"),
    eventsLayer: document.querySelector("#events-layer"),
    emptyBackdrop: document.querySelector("#empty-backdrop"),
    emptyState: document.querySelector("#empty-state"),
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
    emptyAddButton: document.querySelector("#empty-add-button"),
    closeButton: document.querySelector("#close-dialog-button"),
    cancelButton: document.querySelector("#cancel-button"),
    infoButton: document.querySelector("#info-button"),
    infoDialog: document.querySelector("#info-dialog"),
    closeInfoButton: document.querySelector("#close-info-dialog-button"),
    confirmInfoButton: document.querySelector("#confirm-info-dialog-button"),
  };

  let storageAvailable = true;
  let store = loadStore();
  let activeDate = getLocalDateKey();
  let editingId = null;
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

  function createEmptyStore() {
    return { version: 1, days: {} };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyStore();

      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !parsed.days || typeof parsed.days !== "object") {
        throw new Error("Unsupported storage format");
      }
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
    const events = store.days[activeDate];
    return Array.isArray(events) ? events : [];
  }

  function setEvents(events) {
    store.days[activeDate] = events;
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
    elements.timelineGrid.append(fragment);
  }

  function formatToday(date = new Date()) {
    return new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(date);
  }

  function eventsOverlap(first, second) {
    return timeToMinutes(first.start) < timeToMinutes(second.end)
      && timeToMinutes(second.start) < timeToMinutes(first.end);
  }

  function findConflicts(candidate, excludedId = null) {
    return getEvents().filter((event) => event.id !== excludedId && eventsOverlap(candidate, event));
  }

  function calculateLayout(events) {
    const sorted = [...events].sort((a, b) => {
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

      cluster.forEach((event) => {
        const start = timeToMinutes(event.start);
        let column = columnEnds.findIndex((end) => end <= start);
        if (column === -1) column = columnEnds.length;
        columnEnds[column] = timeToMinutes(event.end);
        assignments.push({ event, column });
      });

      const columnCount = Math.max(columnEnds.length, 1);
      assignments.forEach(({ event, column }) => {
        layouts.set(event.id, { column, columnCount });
      });
      cluster = [];
      clusterEnd = -1;
    };

    sorted.forEach((event) => {
      const start = timeToMinutes(event.start);
      const end = timeToMinutes(event.end);
      if (cluster.length && start >= clusterEnd) flushCluster();
      cluster.push(event);
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function render() {
    const events = [...getEvents()].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    const layouts = calculateLayout(events);
    const fragment = document.createDocumentFragment();

    events.forEach((event) => {
      const hasConflict = events.some((other) => other.id !== event.id && eventsOverlap(event, other));
      fragment.append(createEventCard(event, layouts.get(event.id), hasConflict));
    });

    elements.eventsLayer.replaceChildren(fragment);
    const hasEvents = events.length !== 0;
    elements.emptyBackdrop.hidden = hasEvents;
    elements.emptyState.hidden = hasEvents;
    elements.eventCount.textContent = events.length ? `${events.length} 筆行程` : "尚無行程";
    elements.todayLabel.textContent = formatToday();
    updateCurrentTime();
    syncModalState();
  }

  function syncModalState() {
    const emptyModalOpen = !elements.emptyState.hidden;
    const modalOpen = emptyModalOpen || elements.dialog.open || elements.infoDialog.open;
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
    elements.appShell.inert = emptyModalOpen;
    elements.addButton.inert = emptyModalOpen;
  }

  function preventModalBackgroundScroll(event) {
    if (!pageScrollLocked) return;

    const openDialog = elements.dialog.open
      ? elements.dialog
      : elements.infoDialog.open
        ? elements.infoDialog
        : null;
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
    elements.emptyBackdrop.hidden = true;
    elements.emptyState.hidden = true;
    elements.dialog.showModal();
    syncModalState();
    requestAnimationFrame(() => elements.title.focus());
  }

  function openCreateDialogAtPosition(pointerEvent) {
    if (pointerEvent.target.closest(".event-card, button, .empty-state, .empty-backdrop")) return;

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

  function beginLongPressDrag(pointerEvent, card, mainButton) {
    const event = getEvents().find((item) => item.id === card.dataset.eventId);
    if (!event) return;

    const cardRect = card.getBoundingClientRect();
    const timelineRect = elements.timeline.getBoundingClientRect();
    const duration = timeToMinutes(event.end) - timeToMinutes(event.start);
    const grabOffset = ((pointerEvent.clientY - cardRect.top) / timelineRect.height) * MINUTES_PER_DAY_VIEW;

    dragState = {
      pointerId: pointerEvent.pointerId,
      card,
      mainButton,
      eventId: event.id,
      originalStart: timeToMinutes(event.start),
      previewStart: timeToMinutes(event.start),
      duration,
      grabOffset: Math.max(0, Math.min(grabOffset, duration)),
      startX: pointerEvent.clientX,
      startY: pointerEvent.clientY,
      lastX: pointerEvent.clientX,
      lastY: pointerEvent.clientY,
      active: false,
      movedBeforeActivation: false,
      holdTimer: null,
      autoScrollFrame: null,
    };

    mainButton.setPointerCapture(pointerEvent.pointerId);
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

  function handleDragPointerDown(pointerEvent) {
    if (pointerEvent.button !== 0) return;
    const mainButton = pointerEvent.target.closest(".event-card-main");
    const card = mainButton?.closest(".event-card");
    if (!mainButton || !card) return;
    beginLongPressDrag(pointerEvent, card, mainButton);
  }

  function handleDragPointerMove(pointerEvent) {
    if (!dragState || pointerEvent.pointerId !== dragState.pointerId) return;
    dragState.lastX = pointerEvent.clientX;
    dragState.lastY = pointerEvent.clientY;
    const distance = Math.hypot(pointerEvent.clientX - dragState.startX, pointerEvent.clientY - dragState.startY);

    if (!dragState.active) {
      if (distance > MOVE_TOLERANCE) {
        dragState.movedBeforeActivation = true;
        clearLongPressTimer();
      }
      return;
    }

    pointerEvent.preventDefault();
    updateDragPreview(pointerEvent.clientX, pointerEvent.clientY);
  }

  function finishDrag(pointerEvent, cancelled = false) {
    if (!dragState || pointerEvent.pointerId !== dragState.pointerId) return;
    clearLongPressTimer();
    const finishedState = dragState;

    if (finishedState.autoScrollFrame) window.cancelAnimationFrame(finishedState.autoScrollFrame);
    if (finishedState.mainButton.hasPointerCapture(pointerEvent.pointerId)) {
      finishedState.mainButton.releasePointerCapture(pointerEvent.pointerId);
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

  function updateCurrentTime() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const inRange = getEvents().length > 0
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
    if (nextDate !== activeDate) {
      activeDate = nextDate;
      if (elements.dialog.open) closeDialog();
      render();
      return;
    }
    elements.todayLabel.textContent = formatToday();
    updateCurrentTime();
  }

  elements.addButton.addEventListener("click", () => openCreateDialog());
  elements.emptyAddButton.addEventListener("click", () => openCreateDialog());
  ["pointerdown", "click", "dblclick"].forEach((eventName) => {
    elements.emptyBackdrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
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
  elements.start.addEventListener("change", updateConflictWarning);
  elements.end.addEventListener("change", updateConflictWarning);
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) closeDialog();
  });
  elements.dialog.addEventListener("close", render);
  elements.infoDialog.addEventListener("click", (event) => {
    if (event.target === elements.infoDialog) closeInfoDialog();
  });
  elements.infoDialog.addEventListener("close", syncModalState);
  elements.eventsLayer.addEventListener("pointerdown", handleDragPointerDown);
  elements.eventsLayer.addEventListener("pointermove", handleDragPointerMove);
  elements.eventsLayer.addEventListener("pointerup", (event) => finishDrag(event));
  elements.eventsLayer.addEventListener("pointercancel", (event) => finishDrag(event, true));
  elements.eventsLayer.addEventListener("click", (event) => {
    if (Date.now() < suppressClickUntil) return;
    const card = event.target.closest(".event-card");
    if (!card) return;
    if (event.target.closest(".delete")) deleteEvent(card.dataset.eventId);
    else openEditDialog(card.dataset.eventId);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshDateIfNeeded();
  });
  window.addEventListener("focus", refreshDateIfNeeded);

  populateTimeOptions();
  buildTimelineGrid();
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
