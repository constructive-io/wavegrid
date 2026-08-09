/**
 * The embedded laser UI. It is the EXISTING @wavegrid/ui SPA, served byte-for-
 * byte by the brain on its own origin, rendered in a native WebContentsView
 * overlaid on the Blocks renderer. A WebContentsView (not an iframe) keeps the
 * laser UI in its own web contents — its own JS/CSS/WebSocket to the same
 * origin — so the Blocks admin theme can never leak into it, and we never fork
 * or restyle the laser UI.
 */
import { shell, WebContentsView } from 'electron';

import { runtime } from '@/main/runtime';
import type { LaserSyncState } from '@/types/ipc';

export type { LaserSyncState } from '@/types/ipc';

let view: WebContentsView | null = null;
let loadedUrl: string | null = null;

export function resetLaserView(): void {
  view = null;
  loadedUrl = null;
}

/**
 * Drop the loaded-URL memo so the next sync reloads the page. The brain serves
 * a different project on the same origin after a project switch, so without
 * this the embedded UI keeps rendering the previous project's layout.
 */
export function invalidateLaserView(): void {
  loadedUrl = null;
  if (view && !view.webContents.isDestroyed()) void view.webContents.reload();
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
  // A load that failed (brain not listening yet) must not count as loaded, or
  // the URL gate below would never retry and the panel would stay blank.
  created.webContents.on('did-fail-load', () => {
    loadedUrl = null;
  });
  win.contentView.addChildView(created);
  view = created;
  return created;
}

/** Reconcile the native laser view against the renderer's desired state. */
export function syncLaser(state: LaserSyncState): void {
  const { url, bounds, visible } = state;
  if (!url || !visible) {
    if (view && !view.webContents.isDestroyed()) view.setVisible(false);
    return;
  }
  const v = ensureView();
  if (!v) return;
  if (loadedUrl !== url) {
    loadedUrl = url;
    void v.webContents.loadURL(url).catch(() => {
      // Brain not up yet / refused — the renderer shows its own empty state.
    });
  }
  v.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  });
  v.setVisible(true);
}
