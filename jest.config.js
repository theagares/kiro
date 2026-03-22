/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/backend'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js',
    '**/*.spec.js',
  ],
  collectCoverageFrom: [
    'backend/**/*.js',
    '!backend/**/.gitkeep',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
