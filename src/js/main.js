import {
  END_HOUR,
  START_HOUR,
  VALID_COLORS,
  VALID_MOBILE_PANELS,
} from "./config.js";
import { createDragController } from "./drag.js";
import { getElements } from "./dom.js";
import { createModalController } from "./modal.js";
import { registerServiceWorker } from "./pwa.js";
import {
  buildTimelineGrid,
  calculateLayout,
  createEventCard,
  eventsOverlap,
  findConflicts,
  getDefaultTimes,
  getTimesFromTimelinePosition,
  getViewTitle,
  refreshDateHeader,
  removeLegacyTimeOptions,
  ensureTimeOption,
  populateTimeOptions,
  updateCurrentTime,
} from "./schedule.js";
import { createStorageController } from "./storage.js";
import {
  clearTodoFormError,
  createScheduledTodoCard,
  getScheduledTodosForView,
  getTodoCandidate,
  getTodoEndDate,
  getTodoEndTime,
  getTodoPriority,
  getTodoStartTime,
  getTodoVisibleTimeRange,
  populateTodoTimeOptions,
  renderTodos,
  resetTodoForm,
  syncTodoEndFromStart,
  validateTodoCandidate,
} from "./todo.js";
import {
  getLocalDateKey,
  minutesToTime,
  shiftDateKey,
  timeToMinutes,
} from "./time.js";

const elements = getElements();
const state = {
  currentDateKey: getLocalDateKey(),
  viewDateKey: null,
  editingId: null,
  editingTodoId: null,
  mobilePanel: "schedule",
};
state.viewDateKey = state.currentDateKey;

function showStorageNotice(message) {
  elements.storageNotice.textContent = message;
  elements.storageNotice.hidden = false;
}

const storage = createStorageController(showStorageNotice);
const modalController = createModalController(elements);

function getEvents() {
  return storage.getEvents(state.viewDateKey);
}

function setEvents(events) {
  storage.setEvents(state.viewDateKey, events);
}

function getTodos() {
  return storage.getTodos();
}

function setTodos(todos) {
  storage.setTodos(todos);
}

function setMobilePanel(panel) {
  state.mobilePanel = VALID_MOBILE_PANELS.has(panel) ? panel : "schedule";
  elements.workspaceLayout.dataset.mobilePanel = state.mobilePanel;
  document.body.dataset.mobilePanel = state.mobilePanel;
  elements.mobilePanelButtons.forEach((button) => {
    const isActive = button.dataset.mobilePanelTarget === state.mobilePanel;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  if (state.mobilePanel === "schedule") updateCurrentTime(elements, state);
}

function render() {
  const events = [...getEvents()].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const scheduledTodos = getScheduledTodosForView(getTodos(), state.viewDateKey);
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
  refreshDateHeader(elements, state);
  elements.appTitle.textContent = getViewTitle(state);
  document.title = getViewTitle(state);
  elements.appShell.setAttribute("data-view-date", state.viewDateKey);
  updateCurrentTime(elements, state);
  renderTodos({
    elements,
    todos: getTodos(),
    editingTodoId: state.editingTodoId,
    onEditingTodoMissing: () => resetTodoForm(elements, state),
  });
}

function openCreateTodoDialog() {
  resetTodoForm(elements, state);
  elements.todoDialog.showModal();
  modalController.syncModalState();
  requestAnimationFrame(() => elements.todoTitle.focus());
}

function closeTodoDialog() {
  if (elements.todoDialog.open) elements.todoDialog.close();
}

function handleTodoDialogClose() {
  resetTodoForm(elements, state);
  modalController.syncModalState();
  render();
}

function handleTodoSubmit(event) {
  event.preventDefault();
  const candidate = getTodoCandidate(elements);
  const error = validateTodoCandidate(candidate);
  if (error) {
    elements.todoFormError.textContent = error;
    elements.todoFormError.hidden = false;
    elements.todoTitle.focus();
    return;
  }

  const now = new Date().toISOString();
  const todos = [...getTodos()];
  if (state.editingTodoId) {
    const index = todos.findIndex((todo) => todo.id === state.editingTodoId);
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
  resetTodoForm(elements, state);
  closeTodoDialog();
  renderTodos({
    elements,
    todos: getTodos(),
    editingTodoId: state.editingTodoId,
    onEditingTodoMissing: () => resetTodoForm(elements, state),
  });
  render();
}

function openEditTodo(id) {
  const todo = getTodos().find((item) => item.id === id);
  if (!todo) return;
  state.editingTodoId = id;
  elements.todoTitle.value = todo.title;
  elements.todoForm.elements.priority.value = getTodoPriority(todo.priority);
  elements.todoDate.value = todo.scheduledDate || "";
  elements.todoEndDate.value = getTodoEndDate(todo);
  elements.todoStart.value = getTodoStartTime(todo);
  elements.todoEnd.value = getTodoEndTime(todo);
  elements.todoNotes.value = todo.notes || "";
  elements.todoDialogTitle.textContent = "編輯 Todo";
  elements.todoSubmitButton.textContent = "儲存修改";
  clearTodoFormError(elements);
  elements.todoDialog.showModal();
  modalController.syncModalState();
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
  if (state.editingTodoId === id) closeTodoDialog();
  render();
}

function clearCompletedTodos() {
  const completedCount = getTodos().filter((todo) => todo.completed).length;
  if (!completedCount) return;
  if (!window.confirm(`確定要清除 ${completedCount} 個已完成 Todo 嗎？`)) return;
  setTodos(getTodos().filter((todo) => !todo.completed));
  if (state.editingTodoId && !getTodos().some((todo) => todo.id === state.editingTodoId)) closeTodoDialog();
  render();
}

function openCreateDialog(defaults = getDefaultTimes()) {
  state.editingId = null;
  removeLegacyTimeOptions(elements);
  elements.form.reset();
  elements.start.value = defaults.start;
  elements.end.value = defaults.end;
  elements.dialogTitle.textContent = "新增行程";
  clearFormMessages();
  elements.dialog.showModal();
  modalController.syncModalState();
  requestAnimationFrame(() => elements.title.focus());
}

function openCreateDialogAtPosition(pointerEvent) {
  if (pointerEvent.target.closest(".event-card, button")) return;
  openCreateDialog(getTimesFromTimelinePosition(elements, pointerEvent));
}

function openEditDialog(id) {
  const event = getEvents().find((item) => item.id === id);
  if (!event) return;
  state.editingId = id;
  removeLegacyTimeOptions(elements);
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
  modalController.syncModalState();
  requestAnimationFrame(() => elements.title.focus());
}

function closeDialog() {
  elements.dialog.close();
  state.editingId = null;
}

function handleEventDialogClose() {
  state.editingId = null;
  modalController.syncModalState();
  render();
}

function openInfoDialog() {
  elements.infoDialog.showModal();
  modalController.syncModalState();
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

  const conflicts = findConflicts(getEvents(), candidate, state.editingId);
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
  if (state.editingId) {
    const index = events.findIndex((item) => item.id === state.editingId);
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

function refreshDateIfNeeded() {
  const nextDate = getLocalDateKey();
  if (nextDate !== state.currentDateKey) {
    state.currentDateKey = nextDate;
    render();
    return;
  }
  refreshDateHeader(elements, state);
  elements.appTitle.textContent = getViewTitle(state);
  document.title = getViewTitle(state);
  updateCurrentTime(elements, state);
}

const dragController = createDragController({
  elements,
  getEvents,
  setEvents,
  render,
});

elements.addButton.addEventListener("click", () => openCreateDialog());
elements.dateToggleButton.addEventListener("click", () => {
  state.viewDateKey = state.viewDateKey === state.currentDateKey
    ? shiftDateKey(state.currentDateKey, 1)
    : state.currentDateKey;
  if (elements.dialog.open) closeDialog();
  render();
});
document.addEventListener("wheel", modalController.preventModalBackgroundScroll, { capture: true, passive: false });
document.addEventListener("touchmove", modalController.preventModalBackgroundScroll, { capture: true, passive: false });
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
elements.todoTitle.addEventListener("input", () => clearTodoFormError(elements));
elements.todoDate.addEventListener("input", () => {
  if (elements.todoDate.value) elements.todoEndDate.value = elements.todoDate.value;
  clearTodoFormError(elements);
});
elements.todoEndDate.addEventListener("input", () => clearTodoFormError(elements));
[elements.todoStart, elements.todoEnd].forEach((element) => {
  element.addEventListener("change", () => {
    syncTodoEndFromStart(elements);
    clearTodoFormError(elements);
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
elements.infoDialog.addEventListener("close", modalController.syncModalState);
elements.eventsLayer.addEventListener("pointerdown", dragController.handleDragPointerDown);
elements.eventsLayer.addEventListener("pointermove", dragController.handleDragPointerMove);
elements.eventsLayer.addEventListener("pointerup", (event) => dragController.handleDragPointerEnd(event));
elements.eventsLayer.addEventListener("pointercancel", (event) => dragController.handleDragPointerEnd(event, true));
elements.eventsLayer.addEventListener("touchstart", dragController.handleDragTouchStart, { passive: true });
elements.eventsLayer.addEventListener("touchmove", dragController.handleDragTouchMove, { passive: false });
elements.eventsLayer.addEventListener("touchend", (event) => dragController.handleDragTouchEnd(event));
elements.eventsLayer.addEventListener("touchcancel", (event) => dragController.handleDragTouchEnd(event, true));
elements.eventsLayer.addEventListener("contextmenu", (event) => {
  if (dragController.shouldPreventContextMenu(event)) event.preventDefault();
});
elements.eventsLayer.addEventListener("change", (event) => {
  if (!event.target.matches(".scheduled-todo-checkbox")) return;
  const card = event.target.closest(".scheduled-todo-card");
  if (card) toggleTodoCompleted(card.dataset.todoId);
});
elements.eventsLayer.addEventListener("click", (event) => {
  if (dragController.shouldSuppressClick()) return;
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
  if (document.hidden) dragController.cancelDrag();
  else refreshDateIfNeeded();
});
window.addEventListener("blur", dragController.cancelDrag);
window.addEventListener("focus", refreshDateIfNeeded);

populateTimeOptions(elements);
populateTodoTimeOptions(elements);
buildTimelineGrid(elements);
setMobilePanel("schedule");
render();
window.setInterval(refreshDateIfNeeded, 60_000);
registerServiceWorker();
