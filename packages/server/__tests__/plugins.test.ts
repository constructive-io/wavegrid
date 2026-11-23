import { loadWavegridConfig } from '@wavegrid/layout';
import { openStore } from '@wavegrid/settings';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

import { createHttpApp } from '../src/http-app';

describe('project plugin HTTP surface', () => {
  const env = { ...process.env };
  let folder: string, base: string, server: http.Server, copy: string;
  beforeAll(async () => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-plugin-http-'));
    process.env.APPSTASH_BASE_DIR = path.join(folder, 'store');
    process.env.WAVEGRID_PROJECT = 'venue';
    const source = path.join(folder, 'show');
    fs.mkdirSync(source);
    const files: Record<string, string | Buffer> = {
      'plugin.json': JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0', apiVersion: 1, tabs: ['tab.json'], pattern: 'pattern.js' }),
      'tab.json': JSON.stringify({ id: 'paint', label: 'Plugin paint', cards: [] }),
      'pattern.js': 'globalThis.__pluginHostExecution = true; throw new Error("do not evaluate");',
      'page.html': '<h1>Plugin</h1>', 'style.css': 'body{}', 'image.svg': '<svg/>', 'image.png': Buffer.from([0, 255, 128])
    };
    for (const [file, data] of Object.entries(files)) fs.writeFileSync(path.join(source, file), data);
    const store = openStore();
    store.openProjectFile(path.join(folder, 'venue.wavegrid'), {
      wavegrid: 'project', version: 1, name: 'venue', config: {}, plugins: [{ path: 'show' }]
    });
    copy = path.join(store.paths.data, 'projects', 'venue', 'plugins', 'demo');
    const app = createHttpApp(loadWavegridConfig(), { uiDir: null });
    server = http.createServer((req, res) => { void app(req, res); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(folder, { recursive: true, force: true });
    process.env = env;
  });

  it('reports namespaced tabs and leaves code unevaluated', async () => {
    const res = await fetch(`${base}/api/config`);
    expect(res.status).toBe(200);
    expect((await res.json()).plugins).toEqual([{
      id: 'demo', name: 'Demo', version: '1.0.0',
      tabs: [{ id: 'demo/paint', label: 'Plugin paint', showWhen: 'always', cards: [], pattern: 'pattern.js' }]
    }]);
    expect((globalThis as Record<string, unknown>).__pluginHostExecution).toBeUndefined();
  });

  it.each([
    ['pattern.js', 'javascript'], ['tab.json', 'application/json'], ['page.html', 'text/html'],
    ['style.css', 'text/css'], ['image.svg', 'image/svg+xml'], ['image.png', 'image/png']
  ])('serves %s with MIME and nosniff headers', async (file, type) => {
    const res = await fetch(`${base}/plugins/demo/${file}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain(type);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe('sandbox allow-scripts');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(fs.readFileSync(path.join(copy, file)));
  });

  it.each([
    '/plugins/missing/pattern.js', '/plugins/demo/missing.js', '/plugins/demo/%2e%2e/config.json',
    '/plugins/demo/../config.json', '/plugins/demo/../../api/config', '/plugins/demo/%2e%2e%2fconfig.json',
    '/plugins/demo/%2e%2e%5cconfig.json', '/plugins/demo/%2fetc/passwd', '/plugins/demo/.secret', '/plugins/demo/%zz'
  ])('returns 404 for missing or unsafe paths: %s', async file => {
    // http.request keeps dot segments intact; fetch/URL normalizes them before sending.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = http.get(base, { path: file }, res => {
        expect(res.headers['content-security-policy']).toBe('sandbox allow-scripts');
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
    });
    expect(status).toBe(404);
  });

  it.each(['HEAD', 'POST'])('sandboxes %s plugin responses too', async method => {
    const res = await fetch(`${base}/plugins/demo/page.html`, { method });
    expect(res.status).toBe(method === 'HEAD' ? 200 : 404);
    expect(res.headers.get('content-security-policy')).toBe('sandbox allow-scripts');
  });

  (process.platform === 'win32' ? it.skip : it)('refuses symlink files added to a store copy after startup', async () => {
    fs.symlinkSync(path.join(folder, 'show', 'pattern.js'), path.join(copy, 'alias.js'));
    expect((await fetch(`${base}/plugins/demo/alias.js`)).status).toBe(404);
  });
});
