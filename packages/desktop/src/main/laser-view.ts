/**
 * The embedded laser UI. It is the EXISTING @wavegrid/ui SPA, served byte-for-
 * byte by the brain on its own origin, rendered in a native WebContentsView
 * overlaid on the Blocks renderer. A WebContentsView (not an iframe) keeps the
 * laser UI in its own web contents — its own JS/CSS/WebSocket to the same
 * origin — so the Blocks admin theme can never leak into it, and we never fork
 * or restyle the laser UI.
 */
import { shell, WebContentsView } from 'electron';

import { status } from '@/main/brain';
import { embeddedUrl } from '@/main/operator-session';
import { runtime } from '@/main/runtime';
import type { LaserSyncState } from '@/types/ipc';

export type { LaserSyncState } from '@/types/ipc';

let view: WebContentsView | null = null;
/** What the renderer wants shown, independent of what has actually loaded. */
let desiredUrl: string | null = null;
/** The URL currently loaded (or loading). Null means "nothing usable is up". */
let loadedUrl: string | null = null;
/** Which project's brain served what is loaded. Every project is served on the
 *  same loopback origin, so the URL alone cannot tell two projects apart: the
 *  page has to be re-checked against the running project or a switch leaves the
 *  previous project's interface on screen. */
let loadedProject: string | null = null;
/** True once the current load painted; a loading view is a black rectangle. */
let painted = false;
let retryTimer: NodeJS.Timeout | null = null;
let attempts = 0;
/** Bumped per load so a superseded one (which rejects with ERR_ABORTED) cannot
 *  report failure for the load that replaced it. */
let loadSeq = 0;

const MAX_RETRY_MS = 2000;

export function resetLaserView(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  attempts = 0;
  loadSeq += 1;
  view = null;
  desiredUrl = null;
  loadedUrl = null;
  loadedProject = null;
  painted = false;
}

/** Does what is loaded still match what the brain is serving? */
function stale(url: string): boolean {
  return loadedUrl !== url || loadedProject !== status().project;
}

/**
 * A load can fail for a perfectly ordinary reason — the brain is mid-restart,
 * or a second load aborted this one — and the renderer has no reason to send
 * another sync afterwards, so nothing would ever ask again and the panel would
 * stay black until the operator reloaded the app. Retry it here instead.
 */
function retryLater(url: string): void {
  loadedUrl = null;
  painted = false;
  if (retryTimer || desiredUrl !== url) return;
  const delay = Math.min(MAX_RETRY_MS, 250 * 2 ** attempts);
  attempts += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (desiredUrl === url) load(url);
  }, delay);
}

function load(url: string): void {
  const v = ensureView();
  if (!v) return;
  loadedUrl = url;
  loadedProject = status().project;
  painted = false;
  const seq = ++loadSeq;
  // Carries a session for the active project, so a project switch doesn't
  // strand the operator on a login screen inside their own app.
  v.webContents
    .loadURL(embeddedUrl(url, loadedProject))
    .then(() => {
      if (seq !== loadSeq) return;
      attempts = 0;
      painted = true;
      applyVisibility();
    })
    .catch(() => {
      if (seq === loadSeq) retryLater(url);
    });
}

/** Keep the black rectangle of an unpainted view off-screen: until the page has
 *  loaded the renderer's own empty state is the better thing to look at. */
function applyVisibility(): void {
  if (!view || view.webContents.isDestroyed()) return;
  view.setVisible(Boolean(desiredUrl) && painted);
}

/**
 * Reload the embedded UI. The brain serves a different project on the same
 * origin after a project switch, so without this the embedded UI keeps
 * rendering the previous project's layout.
 */
export function invalidateLaserView(): void {
  attempts = 0;
  if (!view || view.webContents.isDestroyed() || !desiredUrl) {
    // Nothing to reload now; make sure the next sync doesn't mistake the stale
    // page for a usable one.
    loadedUrl = null;
    loadedProject = null;
    return;
  }
  // Not `reload()`: the UI strips the session token out of the address once it
  // has consumed it, so reloading would land on the new project's login screen.
  load(desiredUrl);
}

function ensureView(): WebContentsView | null {
  const win = runtime.mainWindow;
  if (!win || win.isDestroyed()) return null;
  if (view && !view.webContents.isDestroyed()) return view;

  const created = new WebContentsView();
  created.setVisible(false);
  // Pop target=_blank / window.open out to the system browser rather than
  // spawning unmanaged child windows inside the app.
  created.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  // While the embedded UI is full screen it is the only focused thing on the
  // window, so its own web contents sees Escape and the renderer never would —
  // without this there is no keyboard way back out.
  created.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape') return;
    if (!win.isDestroyed()) win.webContents.send('laser:escape');
  });
  created.webContents.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame && desiredUrl && loadedUrl === desiredUrl) retryLater(desiredUrl);
  });
  win.contentView.addChildView(created);
  view = created;
  return created;
}

/** Reconcile the native laser view against the renderer's desired state. */
export function syncLaser(state: LaserSyncState): void {
  const { url, bounds, visible } = state;
  if (!url || !visible) {
    desiredUrl = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    applyVisibility();
    return;
  }
  desiredUrl = url;
  const v = ensureView();
  if (!v) return;
  if (stale(url)) load(url);
  v.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  });
  applyVisibility();
}
