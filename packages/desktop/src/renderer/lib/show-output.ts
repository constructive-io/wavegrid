import type { BrainStatus } from '@/types/ipc';

/**
 * Whether the running receiver is driving anything beyond its console log.
 *
 * A receiver with no OSC target starts cleanly and reports no error, so a
 * console-only show is indistinguishable from a healthy one until an operator
 * notices the lasers never lit.
 */
export function hasOscOutput(status: BrainStatus): boolean {
  return status.receiverOutputs.some((label) => label !== 'Console');
}

/** The OSC outputs only, for display ('Console' is never news to an operator). */
export function oscOutputs(status: BrainStatus): string[] {
  return status.receiverOutputs.filter((label) => label !== 'Console');
}
