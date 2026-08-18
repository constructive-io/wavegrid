import { AMBER_LOOKS, type AmberLook } from '@wavegrid/animations';

import { sendToBrain } from '@/main/brain';

/**
 * The Nova panel's command path.
 *
 * The renderer names a *look*, never a command: only ids from the shared amber
 * catalog reach the brain, and the numeric controls are clamped here rather
 * than trusted from the panel. Everything routes through `sendToBrain`, which
 * refuses unless the named project's brain is the one currently running.
 */

const LOOKS = new Map<string, AmberLook>(AMBER_LOOKS.map((look) => [look.id, look]));

/** Speed multiplier bounds — the server clamps to 0.001..5, this is the range
 *  the panel's slider is useful over. */
const MIN_SPEED = 0.1;
const MAX_SPEED = 3;

/** Run one amber look. False when the id is unknown or that brain isn't live. */
export function applyNovaLook(project: string, id: string): boolean {
  const look = LOOKS.get(id);
  if (!look) return false;
  return sendToBrain(project, { type: look.kind, name: look.id });
}

/** How fast a moving look travels. Only animations read it. */
export function setNovaSpeed(project: string, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
  return sendToBrain(project, { type: 'anim_speed', value: speed });
}

/** Stop whatever is running and go dark. */
export function novaBlackout(project: string): boolean {
  return sendToBrain(project, { type: 'clear' });
}
