const path = require('path');

module.exports = {
    rootDir: __dirname,
    testEnvironment: 'node',
    roots: ['<rootDir>'],
    testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/*.test.ts',
    ],
    transform: {
        '^.+\\.tsx?$': [require.resolve('ts-jest'), {
            tsconfig: path.join(__dirname, 'tsconfig.json'),
        }],
    },
    moduleNameMapper: {
        '^shared/(.*)$': '<rootDir>/$1',
    },
    collectCoverage: false,
    coverageDirectory: '<rootDir>/coverage',
    coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
};
