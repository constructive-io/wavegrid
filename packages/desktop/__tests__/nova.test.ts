/**
 * The Nova panel is an operator surface pointed at live hardware, so the main
 * process treats what the renderer sends as untrusted: only a known amber look
 * reaches the brain, and speed is clamped to something a rig can follow.
 */
const send = jest.fn<boolean, [string, Record<string, unknown>]>();

jest.mock('@/main/brain', () => ({
  sendToBrain: (project: string, cmd: Record<string, unknown>) => send(project, cmd)
}));

import { AMBER_LOOKS } from '@wavegrid/animations';

import { applyNovaLook, novaBlackout, setNovaSpeed } from '@/main/nova';

beforeEach(() => {
  send.mockReset();
  send.mockReturnValue(true);
});

describe('applyNovaLook', () => {
  it('sends each catalog look under its own command type', () => {
    for (const look of AMBER_LOOKS) {
      expect(applyNovaLook('show', look.id)).toBe(true);
      expect(send).toHaveBeenLastCalledWith('show', { type: look.kind, name: look.id });
    }
  });

  it('refuses anything not in the catalog, without touching the brain', () => {
    for (const bad of ['', 'rainbow', 'amber-nope', '../clear']) {
      expect(applyNovaLook('show', bad)).toBe(false);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('reports refusal from the brain when the project is not the live one', () => {
    send.mockReturnValue(false);
    expect(applyNovaLook('other', 'amber')).toBe(false);
  });
});

describe('setNovaSpeed', () => {
  it('passes a usable speed through', () => {
    setNovaSpeed('show', 1.5);
    expect(send).toHaveBeenCalledWith('show', { type: 'anim_speed', value: 1.5 });
  });

  it('clamps instead of rejecting, so a dragged slider never stalls the ring', () => {
    setNovaSpeed('show', 0);
    expect(send).toHaveBeenLastCalledWith('show', { type: 'anim_speed', value: 0.1 });
    setNovaSpeed('show', 99);
    expect(send).toHaveBeenLastCalledWith('show', { type: 'anim_speed', value: 3 });
  });

  it('drops a non-number outright', () => {
    expect(setNovaSpeed('show', Number.NaN)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('novaBlackout', () => {
  it('clears the running look', () => {
    expect(novaBlackout('show')).toBe(true);
    expect(send).toHaveBeenCalledWith('show', { type: 'clear' });
  });
});
