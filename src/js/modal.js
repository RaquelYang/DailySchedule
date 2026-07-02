export function createModalController(elements) {
  let pageScrollLocked = false;
  let lockedScrollY = 0;

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

  return {
    syncModalState,
    preventModalBackgroundScroll,
  };
}
