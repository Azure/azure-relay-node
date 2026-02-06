// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

// Jest configuration for azure-relay-node test suite.
// Tests are organized into unit and integration directories:
//   - Unit tests:        **/tests/unit/**/*.test.js
//   - Integration tests: **/tests/integration/**/*.test.js
//
// Run all tests:              npm test
// Run only unit tests:        npm test -- --testPathPattern=unit
// Run only integration tests: npm test -- --testPathPattern=integration

module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
  ],
  watchman: false,
};
