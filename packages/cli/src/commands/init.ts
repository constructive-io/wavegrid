import { resolveLayout } from '@wavegrid/layout';
import type { Inquirerer, Question } from 'inquirerer';
import c from 'yanse';

import { buildConfig, type InitAnswers, knownPresets, type ShapeKind } from '../config-file';
import { getStore } from '../project';

interface RawArgv {
  [key: string]: unknown;
}

interface FullInitAnswers extends InitAnswers {
  projectName: string;
  createUser?: boolean;
  username?: string;
  password?: string;
}

/**
 * `wavegrid init [name]` — create a project in the centralized store, generate
 * its secrets ONCE, and optionally add a first UI user. Everything the CLI
 * produces lives in the store; there is no shape-specific executable code and
 * no duplicate local config file.
 */
export async function runInit(argv: RawArgv, prompter: Inquirerer): Promise<string> {
  const defaultName = typeof argv.project === 'string' ? argv.project : 'default';

  const questions: Question[] = [
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name',
      default: defaultName
    },
    {
      type: 'list',
      name: 'shape',
      message: 'Layout shape',
      options: ['preset', 'grid', 'ring', 'annulus', 'rings', 'filledRing'],
      default: 'preset'
    },
    {
      type: 'list',
      name: 'preset',
      message: 'Preset',
      options: knownPresets(),
      default: 'grid-7x7',
      when: (a: Partial<FullInitAnswers>) => a.shape === 'preset'
    },
    {
      type: 'number',
      name: 'cols',
      message: 'Grid columns',
      default: 7,
      when: (a: Partial<FullInitAnswers>) => a.shape === 'grid'
    },
    {
      type: 'number',
      name: 'rows',
      message: 'Grid rows',
      default: 7,
      when: (a: Partial<FullInitAnswers>) => a.shape === 'grid'
    },
    {
      type: 'number',
      name: 'count',
      message: 'Number of cannons',
      default: 6,
      when: (a: Partial<FullInitAnswers>) =>
        a.shape === 'ring' || a.shape === 'filledRing' || a.shape === 'annulus'
    },
    {
      type: 'number',
      name: 'innerRadius',
      message: 'Hole in the middle, 0–1 (0 = solid disc)',
      default: 0.5,
      when: (a: Partial<FullInitAnswers>) => a.shape === 'annulus'
    },
    {
      type: 'text',
      name: 'ringCounts',
      message: 'Cannons per ring, outermost first (e.g. 12,8,4,1)',
      default: '12,8,4,1',
      when: (a: Partial<FullInitAnswers>) => a.shape === 'rings'
    },
    {
      type: 'list',
      name: 'mode',
      message: 'Run mode (auto picks simple under the single-laptop threshold)',
      options: ['auto', 'simple', 'distributed'],
      default: 'auto'
    },
    {
      type: 'number',
      name: 'serverPort',
      message: 'Server port',
      default: 3000
    },
    {
      type: 'number',
      name: 'uiPort',
      message: 'UI port',
      default: 3003
    },
    {
      type: 'confirm',
      name: 'createUser',
      message: 'Create a UI login user now?',
      default: false
    },
    {
      type: 'text',
      name: 'username',
      message: 'Username',
      when: (a: Partial<FullInitAnswers>) => a.createUser === true
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password',
      when: (a: Partial<FullInitAnswers>) => a.createUser === true
    }
  ];

  const answers = (await prompter.prompt(argv, questions)) as unknown as FullInitAnswers;

  const normalized: InitAnswers = {
    ...answers,
    shape: answers.shape as ShapeKind
  };
  const projectName = answers.projectName || defaultName;

  const config = buildConfig(normalized);
  const layout = resolveLayout(config.layout);

  const store = getStore();
  store.createProject(projectName, config);
  const gen = store.generateSecrets(projectName);

  if (answers.createUser && answers.username && answers.password) {
    store.addUser(projectName, answers.username, answers.password);
  }

  console.log('');
  console.log(c.green(`  ✓ Created project ${c.bold(projectName)}`));
  console.log(`  → Layout:  ${c.cyan(layout.name)} (${layout.topology}, ${layout.count} cannons)`);
  console.log(`  → Mode:    ${c.cyan(config.mode ?? 'auto')}`);
  console.log(`  → Store:   ${c.gray(store.paths.root)}`);
  if (gen.generated.length) {
    console.log(`  → Secrets: ${c.green('generated')} ${c.gray(`(${gen.generated.join(', ')})`)}`);
  } else {
    console.log(`  → Secrets: ${c.gray('already present')}`);
  }
  if (answers.createUser && answers.username) {
    console.log(`  → User:    ${c.cyan(answers.username)}`);
  }
  console.log('');
  console.log(`  Start it with ${c.bold(`wavegrid start${projectName === 'default' ? '' : ` --project ${projectName}`}`)}`);
  console.log('');

  return projectName;
}
