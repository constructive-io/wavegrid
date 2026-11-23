import { type Layout, presets } from '@wavegrid/layout/client';
import { useEffect, useState } from 'react';

import { coercePlugins, type UIPlugin } from './plugin-data';

/** Same-origin WebSocket URL — the server serves this UI and the WS on one port. */
function sameOriginWs(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}`;
}

export interface GridConfig {
  simulatorUrl: string;
  runMode?: string;
  layout: Layout;
  numCannons: number;
  gridColumns: number;
  plugins: UIPlugin[];
}

/**
 * Fetch the resolved layout/config from the runtime API route.
 * A single UI build serves any installation — the layout (fixtures,
 * topology, counts) is the source of geometry.
 *
 * `refetchKey` re-runs the fetch when it changes — bump it when a config
 * change is replicated over the sync channel so the browser stays current.
 */
export function useConfig(refetchKey: number = 0): GridConfig | null {
  const [config, setConfig] = useState<GridConfig | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => { if (!r.ok) throw new Error(`Config: HTTP ${r.status}`); return r.json(); })
      .then((data: GridConfig) => setConfig({ ...data, plugins: coercePlugins(data.plugins) }))
      .catch(() => {
        const layout = presets['grid-7x7']();
        setConfig({
          simulatorUrl: sameOriginWs(),
          layout,
          numCannons: layout.count,
          gridColumns: layout.cols,
          plugins: []
        });
      });
  }, [refetchKey]);

  return config;
}
