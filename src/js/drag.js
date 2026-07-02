import {
  END_HOUR,
  LONG_PRESS_DELAY,
  MINUTES_PER_DAY_VIEW,
  MOVE_TOLERANCE,
  START_HOUR,
  TIME_STEP,
} from "./config.js";
import { minutesToTime, timeToMinutes } from "./time.js";

export function createDragController({ elements, getEvents, setEvents, render }) {
  let dragState = null;
  let suppressClickUntil = 0;

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

  function shouldSuppressClick() {
    return Date.now() < suppressClickUntil;
  }

  function shouldPreventContextMenu(event) {
    return Boolean(dragState?.inputType === "touch" && event.target.closest(".event-card-main"));
  }

  return {
    cancelDrag,
    handleDragPointerDown,
    handleDragPointerMove,
    handleDragPointerEnd,
    handleDragTouchStart,
    handleDragTouchMove,
    handleDragTouchEnd,
    shouldPreventContextMenu,
    shouldSuppressClick,
  };
}
