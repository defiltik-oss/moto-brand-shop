export function initNavigationDrawer() {
  const panel = document.getElementById('navigation-drawer');
  const opener = document.getElementById('open-navigation-btn');
  if (!panel || !opener) return;
  document.body.append(panel);

  function setOpen(open: boolean) {
    if (!open && panel!.contains(document.activeElement)) {
      opener!.focus({ preventScroll: true });
    }
    panel!.dataset.open = String(open);
    panel!.inert = !open;
    opener!.setAttribute('aria-expanded', String(open));
  }

  opener.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
  // Restore focus before the selected action opens its own overlay.
  panel.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) setOpen(false);
  }, { capture: true });

  document.addEventListener('pointerdown', (event) => {
    if (panel.dataset.open !== 'true') return;
    if (event.target instanceof Node && !panel.contains(event.target) && !opener.contains(event.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.dataset.open !== 'true' || event.defaultPrevented) return;
    event.preventDefault();
    setOpen(false);
  });
}
