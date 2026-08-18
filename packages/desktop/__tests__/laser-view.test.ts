/**
 * The embedded laser view is the one surface that can silently go black: a load
 * that fails while the brain restarts leaves a native view with nothing painted
 * in it, and the renderer has no reason to ask again. These tests pin the
 * recovery, not the Electron plumbing.
 */
const webContents = {
  isDestroyed: () => false,
  setWindowOpenHandler: jest.fn(),
  on: jest.fn(),
  loadURL: jest.fn<Promise<void>, [string]>()
};
const viewInstance = {
  webContents,
  setVisible: jest.fn(),
  setBounds: jest.fn()
};

jest.mock('electron', () => ({
  shell: { openExternal: jest.fn() },
  WebContentsView: jest.fn(() => viewInstance)
}));
let brainProject: string | null = 'grace';
jest.mock('@/main/brain', () => ({ status: () => ({ project: brainProject }) }));
jest.mock('@/main/operator-session', () => ({ embeddedUrl: (url: string) => `${url}#wg_token=t` }));
jest.mock('@/main/runtime', () => ({
  runtime: { mainWindow: { isDestroyed: () => false, contentView: { addChildView: jest.fn() } } }
}));

import { invalidateLaserView, resetLaserView, syncLaser } from '@/main/laser-view';

const URL = 'http://127.0.0.1:3000/';
const show = (url: string | null = URL) =>
  syncLaser({ url, bounds: { x: 0, y: 0, width: 100, height: 100 }, visible: url != null });

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  // setImmediate stays real so `flush()` can drain the promise queue between
  // the retry timers this exercises.
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  resetLaserView();
  brainProject = 'grace';
  webContents.loadURL.mockReset().mockResolvedValue(undefined);
  viewInstance.setVisible.mockClear();
});

afterEach(() => jest.useRealTimers());

const visibility = () => viewInstance.setVisible.mock.calls.map(([v]) => v);

it('shows the view only once the page has painted', async () => {
  let resolveLoad: () => void = () => undefined;
  webContents.loadURL.mockReturnValueOnce(new Promise<void>((r) => (resolveLoad = r)));

  show();
  expect(visibility().at(-1)).toBe(false);

  resolveLoad();
  await flush();
  expect(visibility().at(-1)).toBe(true);
});

it('retries a load that failed while the brain was restarting', async () => {
  webContents.loadURL.mockRejectedValueOnce(new Error('ERR_CONNECTION_REFUSED'));

  show();
  await flush();
  expect(visibility().at(-1)).toBe(false);

  jest.advanceTimersByTime(250);
  await flush();
  expect(webContents.loadURL).toHaveBeenCalledTimes(2);
  expect(visibility().at(-1)).toBe(true);
});

it('backs off rather than hammering a brain that is still down', async () => {
  webContents.loadURL.mockRejectedValue(new Error('down'));

  show();
  await flush();
  for (const delay of [250, 500, 1000]) {
    jest.advanceTimersByTime(delay);
    await flush();
  }
  expect(webContents.loadURL).toHaveBeenCalledTimes(4);
});

it('stops retrying once the operator leaves the show', async () => {
  webContents.loadURL.mockRejectedValue(new Error('down'));

  show();
  await flush();
  show(null);
  jest.advanceTimersByTime(5000);
  await flush();
  expect(webContents.loadURL).toHaveBeenCalledTimes(1);
  expect(visibility().at(-1)).toBe(false);
});

it('reloads on a project switch, hiding the stale page until the new one paints', async () => {
  show();
  await flush();
  viewInstance.setVisible.mockClear();

  let resolveLoad: () => void = () => undefined;
  webContents.loadURL.mockReturnValueOnce(new Promise<void>((r) => (resolveLoad = r)));
  invalidateLaserView();
  expect(webContents.loadURL).toHaveBeenCalledTimes(2);

  resolveLoad();
  await flush();
  expect(visibility().at(-1)).toBe(true);
});

it('reloads when the brain switched projects behind the same url', async () => {
  show();
  await flush();
  viewInstance.setVisible.mockClear();

  // Every project is served on the same loopback origin, so only the project
  // itself distinguishes the loaded page from the one that should be up.
  brainProject = 'nova';
  let resolveLoad: () => void = () => undefined;
  webContents.loadURL.mockReturnValueOnce(new Promise<void>((r) => (resolveLoad = r)));
  show();

  expect(webContents.loadURL).toHaveBeenCalledTimes(2);
  expect(visibility().at(-1)).toBe(false);

  resolveLoad();
  await flush();
  expect(visibility().at(-1)).toBe(true);
});

it('does not put the stopped show back on screen when the next one starts', async () => {
  show();
  await flush();

  // Stopping the brain hides the view and invalidates the page it holds.
  show(null);
  invalidateLaserView();
  brainProject = 'nova';
  viewInstance.setVisible.mockClear();

  let resolveLoad: () => void = () => undefined;
  webContents.loadURL.mockReturnValueOnce(new Promise<void>((r) => (resolveLoad = r)));
  show();
  expect(webContents.loadURL).toHaveBeenCalledTimes(2);
  expect(visibility()).not.toContain(true);

  resolveLoad();
  await flush();
  expect(visibility().at(-1)).toBe(true);
});

it('does not reload an unchanged url on every sync', async () => {
  show();
  await flush();
  show();
  show();
  expect(webContents.loadURL).toHaveBeenCalledTimes(1);
});
