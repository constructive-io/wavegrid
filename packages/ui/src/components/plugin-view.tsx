import type { Layout } from '@wavegrid/layout/client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { pluginAssetUrl, type PluginTabData } from '@/lib/plugin-data';
import { initialViewLoadState, nextViewLoad, readViewMessage, type RegisterPluginPaint, viewLayout, viewLookCommand, viewLooks, viewMessageFits } from '@/lib/plugin-view-bridge';
import type { Look, PatternState } from '@/lib/socket-state';
import type { usePluginPattern } from '@/lib/use-plugin-pattern';

export function PluginView({ pluginId, tab, layout, looks, pattern, state, send, registerPluginPaint }: {
  pluginId: string;
  tab: PluginTabData;
  layout: Layout;
  looks: Look[];
  pattern: PatternState | null;
  state: ReturnType<typeof usePluginPattern>;
  send: (message: Record<string, unknown>) => void;
  registerPluginPaint: RegisterPluginPaint;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const [frame, setFrame] = useState(initialViewLoadState);
  const loadState = useRef(frame);
  const [height, setHeight] = useState(480);
  const scope = tab.id;
  const snapshot = useRef({ state, looks, pattern, layout });
  snapshot.current = { state, looks, pattern, layout };

  const post = useCallback((message: Record<string, unknown>) => {
    if (!ready.current) return;
    if (!viewMessageFits(message)) { console.warn('Dropped plugin view message exceeding 256 KiB'); return; }
    iframe.current?.contentWindow?.postMessage(message, '*');
  }, []);

  const patternSnapshot = useCallback(() => {
    const current = snapshot.current;
    return { running: current.state.running, params: current.state.running ? current.pattern?.params ?? {} : current.state.params };
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!ready.current) return;
      const result = readViewMessage(event.data, event.source, iframe.current?.contentWindow);
      if (result.warning) console.warn(result.warning);
      const message = result.message;
      if (!message) return;
      const current = snapshot.current;
      switch (message.type) {
      case 'resize': setHeight(message.height); break;
      case 'start': current.state.startWithParams(message.params); break;
      case 'stop': current.state.stop(); break;
      case 'setParams': current.state.apply(message.params); break;
      default: {
        const command = viewLookCommand(message, scope, current.looks);
        if (command) send(command);
      }
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [scope, send]);

  useEffect(() => {
    if (frame.loaded) post({ wg: 1, type: 'state', ...patternSnapshot() });
  }, [pattern, state.running, frame.loaded, post, patternSnapshot]);

  useEffect(() => {
    if (frame.loaded) post({ wg: 1, type: 'looks', looks: viewLooks(looks, scope) });
  }, [looks, scope, frame.loaded, post]);

  useEffect(() => {
    if (!tab.paint) return;
    registerPluginPaint(paint => post({ wg: 1, type: 'paint', ...paint }));
    return () => registerPluginPaint(null);
  }, [tab.paint, registerPluginPaint, post]);

  if (frame.error) return <p role="alert" className="text-sm" style={{ color: '#ff8888' }}>Plugin view stopped after repeated navigation. Reopen this tab to retry.</p>;

  return <iframe key={frame.generation} ref={iframe} title={tab.label} sandbox="allow-scripts" src={pluginAssetUrl(pluginId, tab.view!)}
    style={{ width: '100%', height, border: 0, borderRadius: 12, display: 'block', background: '#101018' }}
    onLoad={event => {
      if (event.currentTarget !== iframe.current) return;
      ready.current = false;
      const next = nextViewLoad(loadState.current, Date.now());
      loadState.current = next;
      setFrame(next);
      if (!next.loaded) return;
      ready.current = true;
      const current = snapshot.current;
      post({ wg: 1, type: 'init', pluginId, tabId: tab.id, layout: viewLayout(current.layout),
        pattern: patternSnapshot(), looks: viewLooks(current.looks, scope) });
    }} />;
}
