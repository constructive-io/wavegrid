import { parsePluginAudio, parsePluginAudioValues } from '../src/plugin-controls';

const binding = { mode: 'grace', params: { hueShift: 'hue', satShift: 'sat' },
  step: { param: 'stops', values: { file: 'view/gradients.json', key: 'stops' }, set: { paint: [] as number[] } } };

it('normalizes optional binding fields and extracts keyed or raw values', () => {
  expect(parsePluginAudio(binding)).toEqual(binding);
  expect(parsePluginAudio({ mode: 'grace', step: { param: 'stops', values: { file: 'values.json' } } }))
    .toEqual({ mode: 'grace', params: {}, step: { param: 'stops', values: { file: 'values.json' }, set: {} } });
  expect(parsePluginAudioValues([{ stops: [[20, 80]], name: 'Amber' }], 'stops')).toEqual([[[20, 80]]]);
  expect(parsePluginAudioValues([null, true, [1, 2], { color: 'red' }])).toEqual([null, true, [1, 2], { color: 'red' }]);
});

it.each([null, {}, { mode: 'energy', params: {} }, { mode: 'grace' }, { ...binding, params: null },
  { ...binding, params: { unknown: 'hue' } }, { ...binding, params: { hueShift: 'constructor' } },
  { ...binding, params: { satShift: 'bad-name' } }, { ...binding, step: { ...binding.step, param: '__proto__' } },
  { ...binding, step: { ...binding.step, set: JSON.parse('{"prototype":1}') } },
  { ...binding, step: { ...binding.step, set: { paint: [Infinity] } } },
  { ...binding, step: { ...binding.step, set: null } },
  ...['../escape', '/absolute', 'C:\\escape', 'view/../escape', 'view//x', '.hidden'].map(file => ({ ...binding, step: { ...binding.step, values: { file } } })),
  { ...binding, step: { ...binding.step, values: { file: 'x.json', key: 'constructor' } } }
])('rejects unsafe or malformed binding: %j', raw => { expect(parsePluginAudio(raw)).toBeNull(); });

it.each([null, [], {}, [undefined], [NaN]])('rejects empty or non-JSON values: %j', raw => {
  expect(() => parsePluginAudioValues(raw)).toThrow();
});
it('requires the selected own property on every keyed catalog item', () => {
  for (const raw of [[null], [{ name: 'No stops' }], [[] as number[], { stops: [] as number[] }]]) expect(() => parsePluginAudioValues(raw, 'stops')).toThrow();
});
