export default {
    testMatch: ['**/test/*.mts'],
    testPathIgnorePatterns: ['/build/', '/node_modules/'],
    resolver: '<rootDir>/etc/mjs-resolver.cjs',
    transform: {
        '\\.mts$': ['ts-jest', { useESM: true }],
    },
    moduleFileExtensions: ['js', 'mts'],
};
