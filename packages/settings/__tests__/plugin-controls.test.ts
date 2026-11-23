import { parsePluginControl } from '../src/plugin-controls';

describe('plugin controls', () => {
  it.each([
    { type: 'slider', param: 'speed', min: 0, max: 5, step: 0.1, default: 1 },
    { type: 'toggle', param: '$enabled', default: false },
    { type: 'select', param: 'mode', options: [{ label: 'One', value: 1 }, { label: 'Off', value: false }], default: 1 },
    { type: 'color', param: '_color', default: '#aAbB12' },
    { type: 'button', label: 'Start', action: 'start' },
    { type: 'button', label: 'Stop', action: 'stop' }
  ])('accepts %j', control => { expect(parsePluginControl(control)).toEqual(control); });

  it('normalizes string select options', () => {
    expect(parsePluginControl({ type: 'select', param: 'mode', options: ['a', 'b'], default: 'b' }))
      .toMatchObject({ options: [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }] });
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rejects reserved parameter name %s', param => {
    expect(parsePluginControl({ type: 'toggle', param, default: true })).toBeNull();
  });

  it.each([
    null, {}, { type: 'future' }, { type: 'button', label: 'Bad', action: 'eval' },
    { type: 'toggle', param: 'bad-key', default: true }, { type: 'toggle', param: '1bad', default: false },
    { type: 'toggle', param: 'enabled', default: 'true' },
    { type: 'color', param: 'color', default: '#abc' },
    { type: 'slider', param: 'speed', min: 5, max: 0, default: 1 },
    { type: 'slider', param: 'speed', min: 0, max: 5, default: 6 },
    { type: 'slider', param: 'speed', min: 0, max: 5, step: 0, default: 1 },
    { type: 'slider', param: 'speed', min: 0, max: Infinity, default: 1 },
    { type: 'select', param: 'mode', options: [], default: 'a' },
    { type: 'select', param: 'mode', options: ['a'], default: 'b' },
    { type: 'select', param: 'mode', options: ['a', { label: 'B', value: 'b' }], default: 'a' },
    { type: 'select', param: 'mode', options: [{ label: 'Unsafe', value: {} }], default: {} }
  ])('rejects %j', control => { expect(parsePluginControl(control)).toBeNull(); });
});
