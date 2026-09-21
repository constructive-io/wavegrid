import { Link } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface JoinBrainProps {
  value: string;
  saved: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  busy: boolean;
  disabled: boolean;
}

export function JoinBrain({ value, saved, onChange, onSave, onClear, busy, disabled }: JoinBrainProps) {
  const valid = value.trim() === '' || /^wss?:\/\//i.test(value.trim());
  return (
    <div className='flex flex-col gap-3 rounded-lg border px-4 py-3'>
      <div className='flex items-center gap-2'>
        <Link className='size-4' />
        <span className='font-medium'>Join a brain</span>
        {saved && <Badge variant='secondary'>receiver-only · {saved}</Badge>}
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder='wss://grace.hipzap.com or ws://192.168.1.42:3000'
          className='min-w-72 flex-1'
        />
        <Button size='sm' disabled={disabled || busy || value.trim() === saved || !valid} onClick={onSave}>
          Save / Join
        </Button>
        {saved && (
          <Button size='sm' variant='outline' disabled={disabled || busy} onClick={onClear}>
            Use local brain
          </Button>
        )}
      </div>
      <p className='text-muted-foreground text-sm'>
        This laptop runs only a receiver and dials that brain instead of starting its own server. Its receiver key must match the brain’s project: import the project from the brain’s export with secrets (<code>wavegrid projects export --with-secrets</code>, or Projects → Export here), or set it with <code>wavegrid projects secrets set receiverKey</code>. Takes effect on the next Start.
      </p>
    </div>
  );
}
