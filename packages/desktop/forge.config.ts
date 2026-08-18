import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

/**
 * Commands that actually build artifacts, and so need the makers.
 *
 * Forge loads this file for *every* command, and importing a maker runs it:
 * `@electron-forge/maker-squirrel` requires `electron-winstaller` at module
 * scope, which fails outright in some pnpm layouts. `start` has no use for
 * makers, so they're imported only when something is being made — otherwise
 * dev is hostage to the packaging toolchain resolving.
 */
const MAKE_COMMANDS = ['make', 'package', 'publish'];

export function needsMakers(argv: string[] = process.argv): boolean {
  return argv.slice(2).some((arg) => MAKE_COMMANDS.includes(arg));
}

async function makers(): Promise<NonNullable<ForgeConfig['makers']>> {
  if (!needsMakers()) return [];

  const [{ MakerSquirrel }, { MakerZIP }, { MakerRpm }, { MakerDeb }] = await Promise.all([
    import('@electron-forge/maker-squirrel'),
    import('@electron-forge/maker-zip'),
    import('@electron-forge/maker-rpm'),
    import('@electron-forge/maker-deb')
  ]);

  return [new MakerSquirrel({}), new MakerZIP({}, ['darwin']), new MakerRpm({}), new MakerDeb({})];
}

const config: Omit<ForgeConfig, 'makers'> = {
  packagerConfig: {
    name: 'Wavegrid Desktop',
    // Constructive company mark (assets/icon.{icns,ico}) until Wavegrid has its own.
    icon: './assets/icon',
    asar: true,
    // The traffic toolkit is shell + python the main process spawns, so it has to
    // sit outside the asar archive; it lands at <resources>/traffic.
    extraResource: ['../../tools/traffic']
  },
  rebuildConfig: {},
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main'
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload'
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts'
        }
      ]
    }),
    // Fuses harden the packaged binary before code signing.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};

// Forge awaits a function export, which is what keeps the maker imports lazy.
export default async function forgeConfig(): Promise<ForgeConfig> {
  return { ...config, makers: await makers() };
}
