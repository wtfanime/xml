// TODO: Wait for v3 to migrate to ESM.
module.exports = {
    printWidth: 120,
    tabWidth: 4,
    useTabs: false,
    semi: true,
    singleQuote: true,
    quoteProps: 'consistent',
    jsxSingleQuote: true,
    trailingComma: 'all',
    bracketSpacing: true,
    jsxBracketSameLine: false,
    arrowParens: 'avoid',
    proseWrap: 'always',
    htmlWhitespaceSensitivity: 'ignore',
    vueIndentScriptAndStyle: true,
    endOfLine: 'lf',
    embeddedLanguageFormatting: 'auto',
    pugAttributeSeparator: 'always',
    pugEmptyAttributes: 'none',
    pugClassNotation: 'literal',
    pugIdNotation: 'literal',
    pugClassLocation: 'before-attributes',
    pugPreserveAttributeBrackets: false,
    overrides: [
        {
            files: ['*.json'],
            options: {
                parser: 'json-stringify',
            },
        },
        {
            files: ['*.md'],
            options: {
                printWidth: 80,
            },
        },
        {
            files: ['*.{ts,tsx}'],
            options: {
                parser: 'babel-ts',
            },
        },
        {
            files: ['*.frag'],
            options: {
                parser: 'glsl-parser',
            },
        },
    ],
};
