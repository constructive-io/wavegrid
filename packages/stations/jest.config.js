module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['ts-jest', { babelConfig: false, tsconfig: 'tsconfig.json' }] },
  modulePathIgnorePatterns: ['dist/*']
};
