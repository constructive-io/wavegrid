import { getPresetNames, presets } from './presets';
import type { LayoutSpec, RingSpec } from './types';

/**
 * Human-writable layout shorthand, so a CLI flag or a single text field can
 * describe any shape without hand-editing JSON:
 *
 *   grid-7x7          a built-in preset id
 *   grid:7x7          cols × rows
 *   ring:6            one ring of 6
 *   filled:25         disc masked out of a grid (keeps row/col)
 *   annulus:25        concentric rings with a hole in the middle
 *   annulus:25@0.35   …with the hole sized explicitly (0..1)
 *   rings:12,8,4,1    explicit counts, outermost first
 */
export const LAYOUT_SPEC_FORMS = [
  '<preset>',
  'grid:<cols>x<rows>',
  'ring:<count>',
  'filled:<count>',
  'annulus:<count>[@<innerRadius>]',
  'rings:<outer>,<next>,…'
];

/** Radii for explicit ring counts: evenly spaced, and a lone inner ring is the centre. */
function ringsFromCounts(counts: number[]): RingSpec[] {
  const k = counts.length;
  return counts.map((count, j) => {
    const last = j === k - 1;
    const radius = last && count === 1 ? 0 : (k - j) / k;
    // Stagger alternate rings by half a step so fixtures interleave.
    return { count, radius, phase: j % 2 === 1 ? 180 / count : 0 };
  });
}

function intOrThrow(text: string, what: string): number {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${what} must be a whole number >= 1, got "${text}"`);
  return n;
}

/**
 * Parse the shorthand above into a LayoutSpec. Throws with the accepted forms
 * on anything unrecognized — callers can surface that message as-is.
 */
export function parseLayoutSpec(text: string): LayoutSpec {
  const input = text.trim();
  if (!input) throw new Error(`Empty layout. Use one of: ${LAYOUT_SPEC_FORMS.join(' | ')}`);

  if (presets[input]) return { preset: input };

  const colon = input.indexOf(':');
  if (colon === -1) {
    throw new Error(
      `Unknown layout "${input}". Presets: ${getPresetNames().join(', ')}. ` +
        `Custom: ${LAYOUT_SPEC_FORMS.slice(1).join(' | ')}`
    );
  }

  const kind = input.slice(0, colon).trim().toLowerCase();
  const rest = input.slice(colon + 1).trim();

  switch (kind) {
  case 'grid': {
    const [colsText, rowsText, ...extra] = rest.split(/x/i);
    if (rowsText == null || extra.length) throw new Error(`grid takes <cols>x<rows>, got "${rest}"`);
    return { kind: 'grid', cols: intOrThrow(colsText, 'cols'), rows: intOrThrow(rowsText, 'rows') };
  }
  case 'ring':
    return { kind: 'ring', count: intOrThrow(rest, 'ring count') };
  case 'filled':
  case 'filledring':
    return { kind: 'filledRing', count: intOrThrow(rest, 'filled ring count') };
  case 'annulus':
  case 'hollow': {
    const [countText, innerText] = rest.split('@');
    const spec: LayoutSpec = { kind: 'annulus', count: intOrThrow(countText, 'annulus count') };
    if (innerText != null) {
      const inner = Number(innerText);
      if (!Number.isFinite(inner) || inner < 0 || inner >= 1) {
        throw new Error(`annulus innerRadius must be 0 <= r < 1, got "${innerText}"`);
      }
      spec.innerRadius = inner;
    }
    return spec;
  }
  case 'rings': {
    const counts = rest.split(',').map(part => intOrThrow(part, 'ring count'));
    if (!counts.length) throw new Error('rings takes at least one count');
    return { kind: 'rings', rings: ringsFromCounts(counts) };
  }
  default:
    throw new Error(`Unknown layout kind "${kind}". Use one of: ${LAYOUT_SPEC_FORMS.join(' | ')}`);
  }
}
