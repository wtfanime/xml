import { describe, expect, test } from '@jest/globals';

import { fast_xml, FastBackend } from '../src/index.mjs';

const r = String.raw;

const s = (defs?: Map<string, string>) => {
    return async (ss: TemplateStringsArray, ...xs: any[]) => {
        let impl = new TestBackend(defs);

        await fast_xml(r(ss, ...xs), impl);

        return impl;
    };
};

class TestBackend implements FastBackend, Iterable<any> {
    defs?: Map<string, string> | undefined;

    data: any[] = [];

    constructor(defs?: Map<string, string>) {
        this.defs = defs;
    }

    head(head: string): void | Promise<void> {
        this.data.push({ head });
    }

    otag(tag: string, attrs: Map<string, string>): void {
        this.data.push({ tag, attrs });
    }

    ctag(tag: string): void {
        this.data.push({ tag });
    }

    text(text: string): void {
        this.data.push({ text });
    }

    [Symbol.iterator]() {
        return this.data[Symbol.iterator]();
    }
}

describe('head should be matched correctly', () => {
    test('xml decl', async () => {
        let [{ head }] = await s()`<?xml version="1.0" encoding="UTF-8"?>
            <a></a>
    `;

        expect(head).toBe(r`<?xml version="1.0" encoding="UTF-8"?>
            `);
    });

    test('with bom', async () => {
        let [{ head }] = await s()`${'\uFEFF'}<?xml version="1.0" encoding="UTF-8"?>
            <a></a>
    `;

        expect(head).toBe(r`${'\uFEFF'}<?xml version="1.0" encoding="UTF-8"?>
            `);
    });

    test('doctype decl', async () => {
        let [{ head }] = await s()`
            <!DOCTYPE test PUBLIC "foo>" 'bar>' [
                <!ENTITY a "<b/>" >
            ]>
            <a></a>
    `;

        expect(head).toBe(r`
            <!DOCTYPE test PUBLIC "foo>" 'bar>' [
                <!ENTITY a "<b/>" >
            ]>
            `);
    });

    test('processing instructions', async () => {
        let [{ head }] = await s()`
            <?foo
            bar?>
            <?foo
            bar?>
            <a></a>
    `;

        expect(head).toBe(r`
            <?foo
            bar?>
            <?foo
            bar?>
            `);
    });

    test('comments', async () => {
        let [{ head }] = await s()`
            <!--
            foo
            -->
            <!--
            foo
            -->
            <a></a>
    `;

        expect(head).toBe(r`
            <!--
            foo
            -->
            <!--
            foo
            -->
            `);
    });

    test('everything combined', async () => {
        let [{ head }] = await s()`${'\uFEFF'}<?xml version="1.0" encoding="UTF-8"?>
            <?foo
            bar?>
            <!--
            foo
            -->
            <!DOCTYPE test PUBLIC "foo>" 'bar>' [
                <!ENTITY a "<b/>" >
            ]>
            <!--
            foo
            -->
            <?foo
            bar?>
            <a></a>
        `;

        expect(head).toBe(r`${'\uFEFF'}<?xml version="1.0" encoding="UTF-8"?>
            <?foo
            bar?>
            <!--
            foo
            -->
            <!DOCTYPE test PUBLIC "foo>" 'bar>' [
                <!ENTITY a "<b/>" >
            ]>
            <!--
            foo
            -->
            <?foo
            bar?>
            `);
    });

    test('head is triggered even if there is no head', async () => {
        let [h, a] = await s()`<a></a>`;

        expect(h).toEqual({ head: '' });
        expect(a).toEqual({ tag: 'a', attrs: new Map() });
    });
});

describe('tail should be ignored', () => {
    test('spaces after the last tag are not emitted as text', async () => {
        let [, , , ...rest] = await s()`
            <a></a>
        `;

        expect(rest).toEqual([]);
    });

    test('neither are comments', async () => {
        let [, , , ...rest] = await s()`
            <a></a>
            <!--
            foo
            -->
        `;

        expect(rest).toEqual([]);
    });

    test('nor processing instructions', async () => {
        let [, , , ...rest] = await s()`
            <a></a>
            <?foo
            bar?>
        `;

        expect(rest).toEqual([]);
    });
});

describe('tags should be matched correctly', () => {
    test('open tags', async () => {
        let [, a, b] = await s()`
            <a><b
            ></b></a>
        `;

        expect(a).toEqual({ tag: 'a', attrs: new Map() });
        expect(b).toEqual({ tag: 'b', attrs: new Map() });
    });

    test('close tags', async () => {
        let [, , , b, a] = await s()`
            <a><b></b></a
            >
        `;

        expect(a).toEqual({ tag: 'a' });
        expect(b).toEqual({ tag: 'b' });
    });

    test('void tags', async () => {
        let [, , , a0, a1, b0, b1] = await s()`
            <a>
                <a/><b
                />
            </a>
        `;

        expect(a0).toEqual({ tag: 'a', attrs: new Map() });
        expect(a1).toEqual({ tag: 'a' });
        expect(b0).toEqual({ tag: 'b', attrs: new Map() });
        expect(b1).toEqual({ tag: 'b' });
    });
});

describe('attribute lists should be matched correctly', () => {
    test('no attributes', async () => {
        let [, a, b, , c, d] = await s()`
            <a><b/><c
            ><d
            /></c></a>
        `;

        expect(a).toEqual({ tag: 'a', attrs: new Map() });
        expect(b).toEqual({ tag: 'b', attrs: new Map() });
        expect(c).toEqual({ tag: 'c', attrs: new Map() });
        expect(d).toEqual({ tag: 'd', attrs: new Map() });
    });

    test('with attributes', async () => {
        let [, a, b, , c, d] = await s()`
            <a a='b'><b a='b'
            c="d"/><c
            a='b'
            ><d
            a='b'
            c="d"
            /></c></a>
        `;

        expect(a).toEqual({ tag: 'a', attrs: new Map([['a', 'b']]) });
        expect(b).toEqual({
            tag: 'b',
            attrs: new Map([
                ['a', 'b'],
                ['c', 'd'],
            ]),
        });
        expect(c).toEqual({ tag: 'c', attrs: new Map([['a', 'b']]) });
        expect(d).toEqual({
            tag: 'd',
            attrs: new Map([
                ['a', 'b'],
                ['c', 'd'],
            ]),
        });
    });
});

describe('attribute values should be matched correctly', () => {
    test('without quotes', async () => {
        let [, a] = await s()`
            <a a='b&amp;c'></a>
        `;

        expect(a).toEqual({ tag: 'a', attrs: new Map([['a', 'b&c']]) });
    });

    test('with quotes', async () => {
        let [, a] = await s()`
            <a a='"b&quot;&amp;&apos;c"' d="'e&quot;&amp;&apos;f'"></a>
        `;

        expect(a).toEqual({
            tag: 'a',
            attrs: new Map([
                ['a', `"b"&'c"`],
                ['d', `'e"&'f'`],
            ]),
        });
    });
});

describe('entity expansion should work correctly', () => {
    test('decimal', async () => {
        let [, a, t] = await s()`
            <a a='b&#38;c'>d&#38;e</a>
        `;

        expect(a).toEqual({ tag: 'a', attrs: new Map([['a', 'b&c']]) });
        expect(t).toEqual({ text: 'd&e' });
    });

    test('hex', async () => {
        let [, a, t] = await s()`
            <a a='b&#x26;c'>d&#x26;e</a>
        `;

        expect(a).toEqual({ tag: 'a', attrs: new Map([['a', 'b&c']]) });
        expect(t).toEqual({ text: 'd&e' });
    });

    test('predefined', async () => {
        let [, a, t] = await s()`
            <a a='b&amp;&lt;&gt;&quot;&apos;c'>d&amp;&lt;&gt;&quot;&apos;e</a>
        `;

        expect(a).toEqual({ tag: 'a', attrs: new Map([['a', `b&<>"'c`]]) });
        expect(t).toEqual({ text: `d&<>"'e` });
    });

    test('replacements should be reparsed correctly', async () => {
        let defs = {
            b: '"&c;"',
            c: '(<d e="f"/>)',
        };

        let [, a0, t, d0, d1, u, a1] = await s(new Map(Object.entries(defs)))`
            <a a="[&b;]">[&b;]</a>
        `;

        expect(a0).toEqual({ tag: 'a', attrs: new Map([['a', '["(<d e="f"/>)"]']]) });
        expect(t).toEqual({ text: `["(` });
        expect(d0).toEqual({ tag: 'd', attrs: new Map([['e', 'f']]) });
        expect(d1).toEqual({ tag: 'd' });
        expect(u).toEqual({ text: ')"]' });
        expect(a1).toEqual({ tag: 'a' });
    });
});
