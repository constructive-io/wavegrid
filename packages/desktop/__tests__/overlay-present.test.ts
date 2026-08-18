/**
 * The native laser view sits above the page, so an overlay the app draws over
 * it is invisible until the view gets out of the way. What counts as "an
 * overlay is up" is therefore load-bearing, not cosmetic.
 */
import { overlayPresent, PORTAL_ROOT_ID } from '@/renderer/lib/overlay-present';

const doc = (portalChildren: number | null, bodyModal = false): Document =>
  ({
    getElementById: (id: string) =>
      id === PORTAL_ROOT_ID && portalChildren != null ? { childElementCount: portalChildren } : null,
    body: { querySelector: () => (bodyModal ? {} : null) }
  }) as unknown as Document;

it('is quiet when nothing is overlaid', () => {
  expect(overlayPresent(doc(0))).toBe(false);
});

it('reports overlays portalled into the shell portal root', () => {
  expect(overlayPresent(doc(1))).toBe(true);
});

it('reports a modal that landed on the body instead of the portal root', () => {
  expect(overlayPresent(doc(0, true))).toBe(true);
});

it('tolerates a document without the portal root yet', () => {
  expect(overlayPresent(doc(null))).toBe(false);
});
