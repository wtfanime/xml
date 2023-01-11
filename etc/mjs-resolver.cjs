const MJS = /\.mjs$/;

module.exports = (path, options) => {
    const resolver = options.defaultResolver;

    if (MJS.test(path)) {
        try {
            return resolver(path.replace(MJS, '.mts'), options);
        } catch {}
    }

    return resolver(path, options);
};
