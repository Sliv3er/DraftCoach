module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>'],
    testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/*.test.ts',
    ],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: './tsconfig.json',
        }],
    },
    moduleNameMapper: {
        '^shared/(.*)$': '<rootDir>/$1',
    },
    collectCoverage: false,
    coverageDirectory: '<rootDir>/coverage',
    coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
};
