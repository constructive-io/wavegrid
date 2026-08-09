import { useState } from 'react';

import { type ConnectionInfo,connectionLabel } from '@/lib/connection';

const COLOR: Record<ConnectionInfo['state'], string> = {
  open: '#4a4',
  connecting: '#d9a441',
  down: '#d44'
};

/**
 * The connection dot in the header. Green/amber/red as before, except it now
 * says why: hover (or tap) for the reason, and on a wide header the reason sits
 * next to it while the socket is down, so a red dot is never a dead end.
 */
export function StatusDot({
  info,
  compact = false
}: {
  info: ConnectionInfo;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = connectionLabel(info);
  const down = info.state !== 'open';
  const showText = down && (open || !compact);

  return (
    <span className='flex items-center gap-2'>
      <button
        type='button'
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className='w-2.5 h-2.5 rounded-full'
        style={{ background: COLOR[info.state], border: 'none', padding: 0, cursor: 'pointer' }}
      />
      {showText && (
        <span className='text-xs' style={{ color: info.state === 'down' ? '#d47' : '#8a7', maxWidth: 460 }}>
          {label}
        </span>
      )}
    </span>
  );
}
