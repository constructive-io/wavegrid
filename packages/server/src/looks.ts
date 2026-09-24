import * as fs from 'fs';
import { dirname } from 'path';

/**
 * A saved GracePaint state: everything the pattern needs to be recalled
 * (gradient, motion, paint, animation). Stored on the brain so every UI sees
 * the same list; the receiver never sees Looks, only the live pattern.
 */
export interface Look {
  id: string;
  name: string;
  params: Record<string, unknown>;
  createdAt: number;
}

export const MAX_LOOKS = 48;
export const MAX_LOOK_NAME = 32;

function cleanName(name: unknown, fallback: string): string {
  const s = typeof name === 'string' ? name.trim().slice(0, MAX_LOOK_NAME) : '';
  return s || fallback;
}

function isParams(p: unknown): p is Record<string, unknown> {
  return !!p && typeof p === 'object' && !Array.isArray(p);
}

export class LookStore {
  private looks: Look[] = [];

  constructor(private readonly file: string | null) {
    if (file) this.load();
  }

  list(): Look[] {
    return this.looks.map((l) => ({ ...l }));
  }

  /** Returns the new look, or null if the params are unusable or the list is full. */
  save(name: unknown, params: unknown): Look | null {
    if (!isParams(params)) return null;
    if (this.looks.length >= MAX_LOOKS) return null;
    const look: Look = {
      id: `look-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName(name, `Look ${this.looks.length + 1}`),
      params: JSON.parse(JSON.stringify(params)) as Record<string, unknown>,
      createdAt: Date.now()
    };
    this.looks.push(look);
    this.persist();
    return look;
  }

  rename(id: unknown, name: unknown): boolean {
    const look = this.looks.find((l) => l.id === id);
    if (!look) return false;
    look.name = cleanName(name, look.name);
    this.persist();
    return true;
  }

  remove(id: unknown): boolean {
    const n = this.looks.length;
    this.looks = this.looks.filter((l) => l.id !== id);
    if (this.looks.length === n) return false;
    this.persist();
    return true;
  }

  /** Move a look to a new position (drag to reorder). */
  move(id: unknown, to: unknown): boolean {
    const from = this.looks.findIndex((l) => l.id === id);
    if (from < 0 || typeof to !== 'number') return false;
    const target = Math.max(0, Math.min(this.looks.length - 1, Math.floor(to)));
    const [look] = this.looks.splice(from, 1);
    this.looks.splice(target, 0, look);
    this.persist();
    return true;
  }

  private load(): void {
    if (!this.file || !fs.existsSync(this.file)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { looks?: unknown };
      if (!Array.isArray(raw.looks)) return;
      this.looks = raw.looks.filter(
        (l): l is Look =>
          !!l && typeof l === 'object' && typeof (l as Look).id === 'string' && isParams((l as Look).params)
      ).map((l) => ({
        id: l.id,
        name: cleanName(l.name, 'Look'),
        params: l.params,
        createdAt: typeof l.createdAt === 'number' ? l.createdAt : 0
      }));
    } catch (e) {
      console.error('  ◈ Looks load error:', e instanceof Error ? e.message : String(e));
    }
  }

  private persist(): void {
    if (!this.file) return;
    try {
      fs.mkdirSync(dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, `${JSON.stringify({ looks: this.looks }, null, 2)}\n`, 'utf8');
    } catch (e) {
      console.error('  ◈ Looks save error:', e instanceof Error ? e.message : String(e));
    }
  }
}
