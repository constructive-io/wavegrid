import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { dirname } from 'path';

/**
 * A saved pattern state: everything the pattern needs to be recalled
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

function migrateParams(params: Record<string, unknown>): Record<string, unknown> {
  return params.kind === 'palace' && params.plugin === undefined ? { ...params, plugin: 'palace/palace' } : params;
}

interface JsonRange {
  end: number;
  fields?: Map<string, JsonRange>;
  items?: JsonRange[];
}

function jsonRanges(source: string): JsonRange {
  const tokens = source.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]:,]|[^\s{}[\]:,]+/g);
  let token = tokens.next().value!;
  const next = () => { token = tokens.next().value!; };
  const value = (): JsonRange => {
    const first = token;
    next();
    if (first[0] === '{') {
      const fields = new Map<string, JsonRange>();
      while (token[0] !== '}') {
        const key = JSON.parse(token[0]) as string;
        next();
        next();
        fields.set(key, value());
        if (token[0] === ',') next();
      }
      const end = token.index;
      next();
      return { end, fields };
    }
    if (first[0] === '[') {
      const items: JsonRange[] = [];
      while (token[0] !== ']') {
        items.push(value());
        if (token[0] === ',') next();
      }
      const end = token.index;
      next();
      return { end, items };
    }
    return { end: first.index + first[0].length };
  };
  return value();
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
      params: migrateParams(JSON.parse(JSON.stringify(params)) as Record<string, unknown>),
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
      let contents = fs.readFileSync(this.file, 'utf8');
      const raw = JSON.parse(contents) as { looks?: unknown };
      if (!Array.isArray(raw.looks)) return;
      const migrated: number[] = [];
      raw.looks.forEach((l, index) => {
        if (!isParams(l) || typeof l.id !== 'string' || !isParams(l.params)) return;
        const params = migrateParams(l.params);
        if (params !== l.params) {
          l.params = params;
          migrated.push(index);
        }
      });
      if (migrated.length) {
        const ranges = jsonRanges(contents).fields!.get('looks')!.items!;
        const offsets = migrated.map(index => ranges[index].fields!.get('params')!.end).sort((a, b) => b - a);
        for (const end of offsets) {
          contents = `${contents.slice(0, end)},"plugin":"palace/palace"${contents.slice(end)}`;
        }
        this.write(contents);
      }
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
    this.write(`${JSON.stringify({ looks: this.looks }, null, 2)}\n`);
  }

  private write(contents: string): void {
    if (!this.file) return;
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.mkdirSync(dirname(this.file), { recursive: true });
      fs.writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temporary, this.file);
    } catch (e) {
      console.error('  ◈ Looks save error:', e instanceof Error ? e.message : String(e));
    } finally {
      try { fs.unlinkSync(temporary); } catch { /* Already renamed or never created. */ }
    }
  }
}
