module.exports = {
    testEnvironment: 'node',
    verbose: true,
    collectCoverageFrom: [
        '**/*.js',
        '!**/node_modules/**',
        '!jest.config.js'
    ],
    coverageDirectory: 'coverage',
    testMatch: ['**/*.test.js']
};
