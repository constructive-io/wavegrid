import { useState } from 'react';

import { type GracePaintParams, gracePaintPattern } from '@/lib/grace-paint';
import type { Look } from '@/lib/socket-state';
import { paramsFromLook } from '@/lib/use-grace-paint';

import { ControlGroup } from './control-grid';
import type { PreviewEasing } from './grace-tab';
import { MiniGridPreview, type PreviewFixture } from './mini-grid-preview';

const LOOK_TILE = 104;

/** Sub-tabs of the Looks tab; Playlist (looks in order, seconds each) lands here next. */
type Section = 'looks';
const SECTIONS: { key: Section; label: string }[] = [{ key: 'looks', label: 'Looks' }];

/**
 * Looks tab: GracePaint states saved on the brain (every iPad sees the same
 * list). Tap to recall — it takes over the window on top of whatever animation
 * is running; Save snapshots what is on the window now; Edit exposes
 * rename/delete.
 */
export function LooksTab({
  looks,
  current,
  speed,
  easing,
  fixtures,
  onSave,
  onApply,
  onRename,
  onDelete
}: {
  looks: Look[];
  current: GracePaintParams;
  speed: number;
  easing: PreviewEasing;
  fixtures?: PreviewFixture[];
  onSave: (name: string) => void;
  onApply: (look: Look) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [section, setSection] = useState<Section>('looks');
  const [editing, setEditing] = useState(false);
  const count = fixtures?.length ?? 0;
  const currentJson = JSON.stringify(current);
  const save = () => {
    const name = window.prompt('Name this look', `Look ${looks.length + 1}`);
    if (name === null) return;
    onSave(name);
  };
  const rename = (look: Look) => {
    const name = window.prompt('Rename look', look.name);
    if (name === null || !name.trim() || name.trim() === look.name) return;
    onRename(look.id, name.trim());
  };
  const remove = (look: Look) => {
    if (window.confirm(`Delete "${look.name}"?`)) onDelete(look.id);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 px-2 flex-wrap items-center">
        {SECTIONS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSection(t.key)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: section === t.key ? '#2563eb' : '#1a1a25',
              color: section === t.key ? '#fff' : '#888898',
              border: '1px solid ' + (section === t.key ? '#3b82f6' : '#2a2a35')
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {section === 'looks' && (
        <ControlGroup label={`Saved looks${looks.length ? ` (${looks.length})` : ''}`}>
          <div className="flex gap-3 items-start flex-wrap">
            <button
              onClick={save}
              className="flex flex-col items-center justify-center shrink-0 transition-all active:scale-93"
              style={{
                width: LOOK_TILE,
                height: LOOK_TILE,
                borderRadius: 14,
                background: '#1a1a25',
                border: '1.5px dashed #3a3a48',
                color: '#c8c8d8'
              }}
              title="Save what is on the window now as a Look"
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
              <span className="text-xs font-medium mt-1">Save</span>
            </button>
            {looks.map((look) => {
              const params = count ? paramsFromLook(look, count) : null;
              const active = !!params && JSON.stringify(params) === currentJson;
              return (
                <div key={look.id} className="relative shrink-0" style={{ width: LOOK_TILE }}>
                  <button
                    onClick={() => (editing ? rename(look) : onApply(look))}
                    title={editing ? 'Rename' : `Recall "${look.name}"`}
                    className="relative overflow-hidden transition-all active:scale-93 w-full"
                    style={{
                      height: LOOK_TILE,
                      borderRadius: 14,
                      background: '#0a0a12',
                      border: active ? '2.5px solid #fff' : '2.5px solid transparent'
                    }}
                  >
                    {params ? (
                      <MiniGridPreview
                        source={gracePaintPattern()}
                        speed={speed}
                        attack={easing.attack}
                        alpha={easing.alpha}
                        params={{ ...params }}
                        size={LOOK_TILE}
                        isPattern
                        fixtures={fixtures}
                      />
                    ) : null}
                    <span
                      className="absolute bottom-1 left-0 right-0 text-center text-white font-semibold truncate px-1"
                      style={{ fontSize: 11, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
                    >
                      {look.name}
                    </span>
                  </button>
                  {editing ? (
                    <button
                      onClick={() => remove(look)}
                      className="absolute -top-1 -right-1 rounded-full text-white text-xs font-bold flex items-center justify-center"
                      style={{ width: 20, height: 20, background: '#d44', border: '1.5px solid #0a0a12' }}
                      title="Delete look"
                    >
                  ×
                    </button>
                  ) : null}
                </div>
              );
            })}
            {!looks.length ? (
              <p className="self-center text-xs" style={{ color: '#888898', maxWidth: 260 }}>
            Set up the window in GracePaint, then Save here. Tap a look to bring it back on any iPad.
              </p>
            ) : null}
            {looks.length ? (
              <button
                onClick={() => setEditing((e) => !e)}
                className="self-center shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: editing ? '#2563eb' : '#1a1a25',
                  color: editing ? '#fff' : '#888898',
                  border: '1px solid ' + (editing ? '#3b82f6' : '#2a2a35')
                }}
              >
                {editing ? 'Done' : 'Edit'}
              </button>
            ) : null}
          </div>
        </ControlGroup>
      )}
    </div>
  );
}
