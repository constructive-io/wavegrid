/**
 * Is any overlay (dialog, sheet, popover, menu) on screen?
 *
 * The embedded laser UI is a native WebContentsView stacked *above* the
 * renderer's page, so it is outside the document's z-index entirely: an HTML
 * dialog opened over it is drawn underneath, which reads as the laser panel
 * taking over the screen while a modal is supposedly open. The view therefore
 * has to be hidden for as long as anything is overlaid, and the shell portals
 * every overlay into `#portal-root`, so that container's contents answer the
 * question for all of them at once.
 */
export const PORTAL_ROOT_ID = 'portal-root';

/** Overlays that reached `document.body` instead of the portal root (a
 *  primitive rendered before the root mounted) still count. */
const MODAL_ROLES = '[role="dialog"],[role="alertdialog"]';

export function overlayPresent(doc: Document): boolean {
  const root = doc.getElementById(PORTAL_ROOT_ID);
  if (root && root.childElementCount > 0) return true;
  return doc.body?.querySelector(MODAL_ROLES) != null;
}

/**
 * Call `onChange` whenever overlays appear or disappear. Watches the whole
 * document rather than the portal root, which is itself mounted by React and
 * may not exist yet when this starts observing.
 */
export function watchOverlays(doc: Document, onChange: (present: boolean) => void): () => void {
  let last: boolean | null = null;
  const report = () => {
    const present = overlayPresent(doc);
    if (present === last) return;
    last = present;
    onChange(present);
  };
  const observer = new MutationObserver(report);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  report();
  return () => observer.disconnect();
}
