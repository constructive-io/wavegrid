import type { BrowserWindow } from 'electron';

import type { BrainStatus } from '@/types/ipc';

/** Mutable, process-wide handles the IPC + lifecycle code shares. */
interface Runtime {
  mainWindow: BrowserWindow | null;
  lastStatus: BrainStatus;
}

export const runtime: Runtime = {
  mainWindow: null,
  lastStatus: {
    running: false,
    url: null,
    project: null,
    runMode: null,
    receiverRunning: false,
    lanUrls: [],
    receiverError: null,
    receiverOutputs: [],
    lastError: null
  }
};

/** Push an event + payload to the renderer, if a live window exists. */
export function sendToRenderer(channel: string, payload?: unknown): void {
  const win = runtime.mainWindow;
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
