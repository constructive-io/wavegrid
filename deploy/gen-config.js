#!/usr/bin/env node
/**
 * Generate the receiver's routing config (deploy/routing.json, gitignored).
 *
 * Cross-platform (macOS / Windows / Linux) — uses only Node built-ins.
 * Collects the two BEYOND machine IPs and the cluster (cloud) IP, defaulting
 * to whatever it finds in deploy/.env, then writes a full cannon→projector
 * routing file in the same shape as examples/routing-two-beyond.json.
 *
 * Usage:
 *   node deploy/gen-config.js                  interactive, defaults from .env
 *   node deploy/gen-config.js -y               non-interactive, accept defaults
 *   node deploy/gen-config.js --beyond-a=10.0.0.5 --beyond-b=10.0.0.6 -y
 *   node deploy/gen-config.js --force          overwrite existing routing.json
 *
 * Flags: --cloud-ip --beyond-a --beyond-b --port --flush-hz --cannons
 *        --columns --out --yes/-y (no prompts) --force (overwrite)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEPLOY_DIR = __dirname;
const ENV_FILE = path.join(DEPLOY_DIR, '.env');
const ENV_EXAMPLE = path.join(DEPLOY_DIR, '.env.example');

// ── arg parsing (--key=value, --key value, --flag) ────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) continue;
    if (a === '-y') { out.yes = true; continue; }
    const m = a.replace(/^--?/, '');
    const eq = m.indexOf('=');
    if (eq !== -1) {
      out[m.slice(0, eq)] = m.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
      out[m] = argv[++i];
    } else {
      out[m] = true;
    }
  }
  return out;
}

// ── read KEY=VALUE from an env file (comments / blanks ignored) ────────
function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[line.slice(0, eq).trim()] = val;
  }
  return env;
}

function isLikelyIp(s) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
}

function ask(rl, question, def) {
  const suffix = def !== undefined && def !== '' ? ` [${def}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      const a = answer.trim();
      resolve(a === '' ? (def === undefined ? '' : String(def)) : a);
    });
  });
}

// ── build the routing config object ───────────────────────────────────
function buildRouting({ cloudIp, beyondA, beyondB, port, flushHz, cannons, columns }) {
  const targets = {
    'beyond-a': { type: 'beyond', host: beyondA, port },
    'beyond-b': { type: 'beyond', host: beyondB, port },
  };
  // First half of the grid goes to machine A, the rest to machine B
  // (matches examples/routing-two-beyond.json: 24 on A, 25 on B for a 49 grid).
  const splitA = Math.floor(cannons / 2);
  const routes = [];
  for (let logical = 0; logical < cannons; logical++) {
    const onA = logical < splitA;
    const target = onA ? 'beyond-a' : 'beyond-b';
    const tag = onA ? 'A' : 'B';
    const projectorIndex = onA ? logical : logical - splitA;
    const row = Math.floor(logical / columns);
    const col = logical % columns;
    routes.push({ logical, target, projectorIndex, label: `${tag} row${row} col${col}` });
  }
  return {
    // Not consumed by the receiver — recorded for reference / regeneration.
    cloudIp,
    targets,
    flushHz,
    cannons: routes,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...loadEnv(ENV_EXAMPLE), ...loadEnv(ENV_FILE) }; // .env wins
  const outPath = path.resolve(args.out || path.join(DEPLOY_DIR, 'routing.json'));

  // Defaults: existing routing.json > .env > example fallbacks.
  let existing = {};
  if (fs.existsSync(outPath)) {
    try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { /* ignore */ }
  }
  const exTargets = existing.targets || {};

  const defaults = {
    cloudIp: args['cloud-ip'] || existing.cloudIp || env.CLOUD_IP || '',
    beyondA: args['beyond-a'] || (exTargets['beyond-a'] && exTargets['beyond-a'].host) || env.BEYOND_A_HOST || '192.168.1.68',
    beyondB: args['beyond-b'] || (exTargets['beyond-b'] && exTargets['beyond-b'].host) || env.BEYOND_B_HOST || '192.168.1.69',
    port: parseInt(args.port || env.BEYOND_PORT || (exTargets['beyond-a'] && exTargets['beyond-a'].port) || '8000', 10),
    flushHz: parseInt(args['flush-hz'] || existing.flushHz || '30', 10),
    cannons: parseInt(args.cannons || env.NUM_CANNONS || '49', 10),
    columns: parseInt(args.columns || env.GRID_COLUMNS || '7', 10),
  };

  let answers = { ...defaults };
  const nonInteractive = args.yes === true || !process.stdin.isTTY;

  if (!nonInteractive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\nGenerate receiver routing config (deploy/routing.json)\n');
    answers.cloudIp = await ask(rl, 'Cluster / cloud server IP (CLOUD_IP)', defaults.cloudIp);
    answers.beyondA = await ask(rl, 'BEYOND machine A IP (beyond-a)', defaults.beyondA);
    answers.beyondB = await ask(rl, 'BEYOND machine B IP (beyond-b)', defaults.beyondB);
    answers.port = parseInt(await ask(rl, 'BEYOND OSC port', defaults.port), 10);
    answers.cannons = parseInt(await ask(rl, 'Number of cannons', defaults.cannons), 10);
    answers.columns = parseInt(await ask(rl, 'Grid columns', defaults.columns), 10);
    answers.flushHz = parseInt(await ask(rl, 'Flush rate (Hz)', defaults.flushHz), 10);
    rl.close();
  } else {
    console.log('Non-interactive: using defaults / flags.');
  }

  // Soft validation — warn but don't block (hostnames are allowed).
  for (const [k, v] of [['beyond-a', answers.beyondA], ['beyond-b', answers.beyondB], ['CLOUD_IP', answers.cloudIp]]) {
    if (v && !isLikelyIp(v)) console.warn(`  ⚠ ${k} = "${v}" is not a dotted IP — assuming it's a hostname.`);
  }
  if (!answers.cloudIp) console.warn('  ⚠ CLOUD_IP is empty — set it in deploy/.env or pass --cloud-ip.');

  if (fs.existsSync(outPath) && !args.force) {
    if (nonInteractive) {
      console.error(`\nERROR: ${path.relative(process.cwd(), outPath)} exists. Re-run with --force to overwrite.`);
      process.exit(1);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ok = await ask(rl, `Overwrite ${path.relative(process.cwd(), outPath)}? (y/N)`, 'N');
    rl.close();
    if (!/^y(es)?$/i.test(ok)) { console.log('Aborted.'); process.exit(0); }
  }

  const config = buildRouting(answers);
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n');

  console.log(`\n✓ Wrote ${path.relative(process.cwd(), outPath)}`);
  console.log(`    cloudIp   ${answers.cloudIp || '(unset)'}`);
  console.log(`    beyond-a  ${answers.beyondA}:${answers.port}  (cannons 0–${Math.floor(answers.cannons / 2) - 1})`);
  console.log(`    beyond-b  ${answers.beyondB}:${answers.port}  (cannons ${Math.floor(answers.cannons / 2)}–${answers.cannons - 1})`);
  console.log(`\nPoint the receiver at it:  ROUTING_CONFIG=deploy/routing.json  (in deploy/.env)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
