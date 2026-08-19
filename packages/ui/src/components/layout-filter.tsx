import { layoutFilters } from '@wavegrid/animations';
import type { Layout } from '@wavegrid/layout/client';
import { useCallback, useState } from 'react';

/**
 * Which rig the presets are being judged against. Remembered per surface, so
 * an operator who works a Nova rig doesn't reselect it every time.
 */
export function useLayoutFilter(storageKey: string): [string, (id: string) => void] {
  const [filter, setFilter] = useState<string>(() => {
    if (typeof window === 'undefined') return 'all';
    const saved = window.localStorage.getItem(storageKey);
    return saved && layoutFilters().some(f => f.id === saved) ? saved : 'all';
  });

  const choose = useCallback((id: string) => {
    setFilter(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, id);
  }, [storageKey]);

  return [filter, choose];
}

/**
 * Rig chips. "All" judges against the layout actually running, so the default
 * view is honest about this installation; the named rigs let an operator build
 * and check a show for a rig they are not standing in front of.
 */
export function LayoutFilterChips({
  value,
  onChange,
  layout
}: {
  value: string;
  onChange: (id: string) => void;
  layout: Layout;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {layoutFilters().map((f) => {
        const selected = f.id === value;
        const isThisRig = f.layout ? f.layout.id === layout.id : false;
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            title={f.layout ? f.layout.name : `This rig — ${layout.name}`}
            style={{
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 500,
              background: selected ? '#1a2a3a' : '#12121a',
              border: selected ? '1px solid #4488cc' : '1px solid #1a1a25',
              color: selected ? '#8cf' : '#888898',
              cursor: 'pointer'
            }}
          >
            {f.label}
            {isThisRig && <span style={{ color: '#4ade80', marginLeft: 4 }}>•</span>}
          </button>
        );
      })}
    </div>
  );
}
