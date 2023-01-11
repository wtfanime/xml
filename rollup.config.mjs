import terser from '@rollup/plugin-terser';

export default {
    input: './.build/index.mjs',
    output: [
        {
            file: './dist/index.cjs',
            format: 'cjs',
            sourcemap: true,
        },
        {
            file: './dist/index.mjs',
            format: 'esm',
            sourcemap: true,
        },
    ],
    plugins: [
        terser({
            module: true,
            compress: {
                passes: 2,
            },
            format: {
                comments: /^#__PURE__#$/,
                preserve_annotations: true,
            },
        }),
    ],
};
