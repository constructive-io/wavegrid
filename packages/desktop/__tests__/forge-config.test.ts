import forgeConfig, { needsMakers } from '../forge.config';

describe('forge config', () => {
  it('only wants makers for commands that build artifacts', () => {
    expect(needsMakers(['node', 'electron-forge', 'start'])).toBe(false);
    expect(needsMakers(['node', 'electron-forge', 'make'])).toBe(true);
    expect(needsMakers(['node', 'electron-forge', 'package'])).toBe(true);
    expect(needsMakers(['node', 'electron-forge', 'publish'])).toBe(true);
  });

  it('loads no makers for start, so dev never resolves the packaging toolchain', async () => {
    const argv = process.argv;
    process.argv = ['node', 'electron-forge', 'start'];
    try {
      await expect(forgeConfig()).resolves.toMatchObject({ makers: [] });
    } finally {
      process.argv = argv;
    }
  });

  it('loads every maker when making', async () => {
    const argv = process.argv;
    process.argv = ['node', 'electron-forge', 'make'];
    try {
      const config = await forgeConfig();
      expect(config.makers?.map((maker) => maker.name)).toEqual(['squirrel', 'zip', 'rpm', 'deb']);
    } finally {
      process.argv = argv;
    }
  });

  it('still configures the app itself', async () => {
    const config = await forgeConfig();
    expect(config.packagerConfig?.name).toBe('Wavegrid Desktop');
    expect(config.plugins).toHaveLength(3);
  });
});
