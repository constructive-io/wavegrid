import { type BrainExtensionContext, createBrainExtensionHost } from '@wavegrid/extensions';
import { type ResolvedConfig, resolveLayout } from '@wavegrid/layout';
import type { openStore } from '@wavegrid/settings';
import { stationExtension } from '@wavegrid/stations';
import type { WebSocket } from 'ws';

export function loadBrainExtensions(resolved: ResolvedConfig, ctx: BrainExtensionContext<ReturnType<typeof openStore>>) {
  return createBrainExtensionHost<WebSocket, ReturnType<typeof openStore>>([
    stationExtension(resolved.config.stations, resolved.layout, resolveLayout)
  ], ctx);
}
