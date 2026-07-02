import {
  END_HOUR,
  MINUTES_PER_DAY_VIEW,
  START_HOUR,
  TIME_STEP,
  VALID_COLORS,
} from "./config.js";
import {
  formatDateKey,
  minutesToTime,
  shiftDateKey,
  timeToMinutes,
} from "./time.js";

export function populateTimeOptions(elements) {
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

export function removeLegacyTimeOptions(elements) {
  elements.start.querySelectorAll("option[data-legacy]").forEach((option) => option.remove());
  elements.end.querySelectorAll("option[data-legacy]").forEach((option) => option.remove());
}

export function ensureTimeOption(select, time) {
  if ([...select.options].some((option) => option.value === time)) return;

  const option = new Option(time, time);
  option.dataset.legacy = "true";
  const nextOption = [...select.options].find((item) => timeToMinutes(item.value) > timeToMinutes(time));
  select.insertBefore(option, nextOption || null);
}

export function buildTimelineGrid(elements) {
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

export function clearCurrentTimeOverlaps(elements) {
  elements.timelineGrid.querySelectorAll(".hour-label.is-obscured-by-current-time").forEach((label) => {
    label.classList.remove("is-obscured-by-current-time");
  });
}

export function updateCurrentTimeOverlaps(elements) {
  clearCurrentTimeOverlaps(elements);
  if (elements.currentTimeLine.hidden) return;

  const currentLabelRect = elements.currentTimeLabel.getBoundingClientRect();
  elements.timelineGrid.querySelectorAll(".hour-label").forEach((label) => {
    const labelRect = label.getBoundingClientRect();
    const overlaps = currentLabelRect.left < labelRect.right
      && currentLabelRect.right > labelRect.left
      && currentLabelRect.top < labelRect.bottom
      && currentLabelRect.bottom > labelRect.top;
    label.classList.toggle("is-obscured-by-current-time", overlaps);
  });
}

export function getViewRelation(state) {
  if (state.viewDateKey === state.currentDateKey) return "today";
  if (state.viewDateKey === shiftDateKey(state.currentDateKey, 1)) return "tomorrow";
  if (state.viewDateKey === shiftDateKey(state.currentDateKey, -1)) return "yesterday";
  return "other";
}

export function getViewTitle(state) {
  const relation = getViewRelation(state);
  if (relation === "today") return "今日行程";
  if (relation === "tomorrow") return "明日行程";
  if (relation === "yesterday") return "昨日行程";
  return `${formatDateKey(state.viewDateKey)} 行程`;
}

export function getViewLabel(state) {
  const relation = getViewRelation(state);
  const label = relation === "today"
    ? "今天"
    : relation === "tomorrow"
      ? "明天"
      : relation === "yesterday"
        ? "昨天"
        : "";
  return label ? `${label}・${formatDateKey(state.viewDateKey)}` : formatDateKey(state.viewDateKey);
}

export function getDateToggleLabel(state) {
  return state.viewDateKey === state.currentDateKey ? "明天" : "今天";
}

export function refreshDateHeader(elements, state) {
  const isTomorrow = getViewRelation(state) === "tomorrow";
  elements.todayLabel.textContent = getViewLabel(state);
  elements.dateToggleButton.textContent = getDateToggleLabel(state);
  elements.dateToggleButton.setAttribute("aria-label", `切換到${getDateToggleLabel(state)}`);
  elements.dateToggleButton.title = `切換到${getDateToggleLabel(state)}`;
  elements.scheduleCard.classList.toggle("is-tomorrow", isTomorrow);
}

export function eventsOverlap(first, second) {
  return timeToMinutes(first.start) < timeToMinutes(second.end)
    && timeToMinutes(second.start) < timeToMinutes(first.end);
}

export function findConflicts(events, candidate, excludedId = null) {
  return events.filter((event) => event.id !== excludedId && eventsOverlap(candidate, event));
}

export function calculateLayout(items) {
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

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function createEventCard(event, layout, hasConflict) {
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

export function updateCurrentTime(elements, state) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inRange = state.viewDateKey === state.currentDateKey
    && minutes >= START_HOUR * 60
    && minutes < END_HOUR * 60;
  elements.currentTimeLine.hidden = !inRange;
  if (!inRange) {
    clearCurrentTimeOverlaps(elements);
    return;
  }

  const offsetHours = (minutes - START_HOUR * 60) / 60;
  elements.currentTimeLine.style.setProperty("--current-top", `calc(var(--hour-height) * ${offsetHours})`);
  elements.currentTimeLabel.textContent = minutesToTime(minutes);
  window.requestAnimationFrame(() => updateCurrentTimeOverlaps(elements));
}

export function getDefaultTimes() {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let start = Math.ceil(nowMinutes / TIME_STEP) * TIME_STEP;
  start = Math.max(START_HOUR * 60, Math.min(start, END_HOUR * 60 - TIME_STEP));
  let end = Math.min(start + 60, END_HOUR * 60);
  if (end <= start) end = start + TIME_STEP;
  return { start: minutesToTime(start), end: minutesToTime(end) };
}

export function getTimesFromTimelinePosition(elements, pointerEvent) {
  const timelineRect = elements.timeline.getBoundingClientRect();
  const relativeY = Math.max(0, Math.min(pointerEvent.clientY - timelineRect.top, timelineRect.height));
  const positionMinutes = (relativeY / timelineRect.height) * MINUTES_PER_DAY_VIEW;
  const clickedMinutes = START_HOUR * 60 + positionMinutes;
  const start = Math.max(
    START_HOUR * 60,
    Math.min(Math.round(clickedMinutes / TIME_STEP) * TIME_STEP, END_HOUR * 60 - TIME_STEP),
  );
  const end = Math.min(start + 60, END_HOUR * 60);

  return {
    start: minutesToTime(start),
    end: minutesToTime(end),
  };
}
