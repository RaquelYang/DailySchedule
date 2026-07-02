import {
  END_HOUR,
  START_HOUR,
  TIME_STEP,
  TODO_PRIORITY_LABELS,
  TODO_PRIORITY_RANKS,
  VALID_TODO_PRIORITIES,
} from "./config.js";
import {
  formatDateKey,
  minutesToTime,
  parseDateKey,
  timeToMinutes,
} from "./time.js";

export function populateTodoTimeOptions(elements) {
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

export function getTodoStartTime(todo) {
  return todo.scheduledStart || todo.scheduledTime || "";
}

export function getTodoEndTime(todo) {
  const start = timeToMinutes(getTodoStartTime(todo));
  const explicitEnd = todo.scheduledEnd || "";
  if (Number.isFinite(timeToMinutes(explicitEnd))) return explicitEnd;
  if (!Number.isFinite(start)) return "";
  return minutesToTime(Math.min(start + 60, END_HOUR * 60));
}

export function getTodoEndDate(todo) {
  return todo.scheduledEndDate || todo.scheduledDate || "";
}

export function getTodoTimeRange(todo) {
  const start = getTodoStartTime(todo);
  const end = getTodoEndTime(todo);
  return { start, end };
}

export function getTodoVisibleTimeRange(todo) {
  const { start, end } = getTodoTimeRange(todo);
  return {
    start,
    end: getTodoEndDate(todo) === todo.scheduledDate ? end : minutesToTime(END_HOUR * 60),
  };
}

export function hasScheduledTodoTime(todo) {
  const { start, end } = getTodoVisibleTimeRange(todo);
  return Boolean(todo.scheduledDate && start && end)
    && Number.isFinite(timeToMinutes(start))
    && Number.isFinite(timeToMinutes(end))
    && timeToMinutes(end) > timeToMinutes(start);
}

export function getScheduledTodosForView(todos, viewDateKey) {
  return todos
    .filter((todo) => todo.scheduledDate === viewDateKey && hasScheduledTodoTime(todo))
    .sort((a, b) => timeToMinutes(getTodoStartTime(a)) - timeToMinutes(getTodoStartTime(b))
      || getTodoTimestamp(a.createdAt) - getTodoTimestamp(b.createdAt));
}

export function getTodoPriority(priority) {
  return VALID_TODO_PRIORITIES.has(priority) ? priority : "medium";
}

export function getTodoTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function formatTodoScheduleRange(todo, includeDate = false) {
  const { start, end } = getTodoTimeRange(todo);
  const endDate = getTodoEndDate(todo);
  if (!todo.scheduledDate || !start || !end) return "";
  if (endDate === todo.scheduledDate) {
    return includeDate ? `${formatDateKey(todo.scheduledDate)} ${start}–${end}` : `${start}–${end}`;
  }
  return `${formatDateKey(todo.scheduledDate)} ${start}–${formatDateKey(endDate)} ${end}`;
}

export function createScheduledTodoCard(todo, layout) {
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

export function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
    const priorityDiff = TODO_PRIORITY_RANKS[getTodoPriority(a.priority)] - TODO_PRIORITY_RANKS[getTodoPriority(b.priority)];
    if (priorityDiff) return priorityDiff;
    return getTodoTimestamp(a.createdAt) - getTodoTimestamp(b.createdAt);
  });
}

export function createTodoItem(todo) {
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

export function renderTodos({ elements, todos, editingTodoId, onEditingTodoMissing }) {
  const sortedTodos = sortTodos(todos);
  const fragment = document.createDocumentFragment();
  const completedCount = sortedTodos.filter((todo) => todo.completed).length;

  sortedTodos.forEach((todo) => fragment.append(createTodoItem(todo)));
  elements.todoList.replaceChildren(fragment);
  elements.todoEmptyState.hidden = sortedTodos.length > 0;
  elements.todoCount.textContent = sortedTodos.length
    ? `${sortedTodos.length} 個待辦・${completedCount} 個完成`
    : "尚無待辦";
  elements.clearCompletedTodosButton.disabled = completedCount === 0;

  if (editingTodoId && !todos.some((todo) => todo.id === editingTodoId)) {
    onEditingTodoMissing();
  }
}

export function clearTodoFormError(elements) {
  elements.todoFormError.hidden = true;
  elements.todoFormError.textContent = "";
}

export function resetTodoForm(elements, state) {
  state.editingTodoId = null;
  elements.todoForm.reset();
  elements.todoForm.elements.priority.value = "medium";
  elements.todoDate.value = "";
  elements.todoEndDate.value = "";
  elements.todoStart.value = "";
  elements.todoEnd.value = "";
  elements.todoDialogTitle.textContent = "新增 Todo";
  elements.todoSubmitButton.textContent = "新增 Todo";
  clearTodoFormError(elements);
}

export function getTodoCandidate(elements) {
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

export function validateTodoCandidate(candidate) {
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

export function syncTodoEndFromStart(elements) {
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
