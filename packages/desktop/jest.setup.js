// Every desktop suite gets an isolated settings store. Without this, openStore()
// and the config loader resolve to the developer's real ~/.wavegrid and a test
// run can create projects there or flip the active one.
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

process.env.APPSTASH_BASE_DIR = mkdtempSync(join(tmpdir(), 'wavegrid-desktop-test-'));
