import {
  applySocketMessage,
  beginConnection,
  createSocketSnapshot,
  isFeedStale,
  isSyncConfigMessage
} from '../src/lib/socket-state';

describe('socket state snapshots', () => {
  it('drops the old connection state and applies a complete fresh burst', () => {
    const old = applySocketMessage(
      applySocketMessage(
        applySocketMessage(
          applySocketMessage(createSocketSnapshot(100), { type: 'state', grid: [{ h: 10, s: 20, b: 30 }] }, 110),
          { type: 'settings', alpha: 0.2, attack: 0.4, speed: 2, animation: 'pulse' },
          120
        ),
        { type: 'orientation', rotation: 90, flipH: true, flipV: false },
        130
      ),
      { type: 'playlist_state', active: true, currentStep: 1, playlist: null },
      140
    );
    const fresh = beginConnection(old, 200);
    expect(fresh.epoch).toBe(old.epoch + 1);
    expect(fresh.grid).toEqual([]);
    expect(fresh.settings).toBeNull();
    expect(fresh.playlistState).toBeNull();

    const synced = applySocketMessage(
      applySocketMessage(
        applySocketMessage(
          applySocketMessage(fresh, { type: 'state', grid: [{ h: 1, s: 2, b: 3 }] }, 210),
          { type: 'orientation', rotation: 180, flipH: false, flipV: true },
          211
        ),
        { type: 'settings', alpha: 0.06, attack: 1, speed: 1, animation: null },
        212
      ),
      { type: 'playlist_state', active: false, currentStep: 0, playlist: null },
      213
    );
    expect(synced.grid).toEqual([{ h: 1, s: 2, b: 3 }]);
    expect(synced.orientation).toEqual({ rotation: 180, flipH: false, flipV: true });
    expect(synced.settings).toEqual({ alpha: 0.06, attack: 1, speed: 1, animation: null });
    expect(synced.playlistState).toEqual({ active: false, currentStep: 0, playlist: null });
  });

  it('signals sync messages and detects a silent feed', () => {
    const snapshot = beginConnection(createSocketSnapshot(0), 1);
    expect(isSyncConfigMessage({ type: 'sync_update' })).toBe(true);
    expect(isSyncConfigMessage({ type: 'sync_state' })).toBe(true);
    expect(isSyncConfigMessage({ type: 'state' })).toBe(false);
    expect(isSyncConfigMessage(null)).toBe(false);
    expect(isSyncConfigMessage('sync_state')).toBe(false);

    const updated = applySocketMessage(snapshot, { type: 'sync_state', revision: 1, entries: {} }, 10);

    expect(updated.lastMessageAt).toBe(10);
    expect(applySocketMessage(updated, { type: 'sync_update' }, 20).lastMessageAt).toBe(20);
    expect(isFeedStale(updated, 8_011)).toBe(true);
    expect(isFeedStale(updated, 8_009)).toBe(false);
  });
});
