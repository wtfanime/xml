# μXML

Minimal and fast non-validating SAX-like XML reader.

-   When to use it:
    -   You just need to communicate with XML-based API.
    -   You just need to read XML-based configs or whatever.
    -   You don’t care of ill-formed or invalid markup.
    -   You don’t care of comments and processing instructions.
    -   You don’t care of source locations.
-   When **NOT** to use it:
    -   You need to parse HTML, SVG, JSX, templates, etc.
    -   You need to validate, debug, or format XML.
    -   You need to handle comments and/or processing instructions.
    -   You need to read XML streamingly.

## Usage

```bash
yarn add microxml
```

```bash
npm install microxml
```

```typescript
import { fast_xml, FastBackend } from 'microxml';

class ExampleBackend implements FastBackend {
    /** A table of entity definitions. */
    defs = new Map([
        ['foo', '"&bar;"'],
        ['bar', '<baz/>'],
    ]);

    /** Handle `<?xml...?>` and `<!DOCTYPE>`. */
    async head(text: string) {
        console.log('prolog %o', text);
    }

    otag(tag: string, attrs: Map<string, string>) {
        console.log('opening tag %o %o', tag, attrs);
    }

    ctag(tag: string) {
        console.log('closing tag %o', tag);
    }

    text(text: string) {
        console.log('text %o', text);
    }
}

const src = `
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE example>
    <test a="&foo;">
        &foo;
    </test>
`;

fast_xml(src, new ExampleBackend());
```

## Features and non-features

-   <span id="br1"></span> The fastest[¹](#fn1).
-   <span id="br2"></span> The smallest[¹](#fn1) (≈1.5kB minified, **no gzip**).
-   ~~The smartest.~~
-   ~~The strongest.~~
-   Unlike many others, **DOES** reparse entity replacements:
    -   With `x`=`<b>&y;</b>`, `y`=`"<c/>"`:
        -   `<a>&x;</a>`≡`<a><b>"<c/>"</b></a>`,
        -   `<a b="&x;" />`≡`<a b='<b>"<c/>"</b>'/>`.
-   May or may not explode in your face at ill-formed code.
-   May or may not explode in your face at invalid code.
-   Doesn’t parse `<?xml...?>` and `<!DOCTYPE>` declarations.
    -   But the `async head(text: string)` hook may do the trick.
-   Doesn’t parse HTML.
-   Doesn’t parse SVG.
-   Doesn’t parse JSX.
-   Doesn’t parse templates.
-   Doesn’t handle boolean and unquoted attributes `<a b c=d>`.
-   Doesn’t handle references without the trailing semicolon `&ampwtf`.
-   Doesn’t handle tags without the name `<></>`.
-   Doesn’t handle tags like `<script>` and `<style>`.
-   Doesn’t handle void tags differently.
-   Doesn’t read streaming inputs.
-   Doesn’t report source locations.
-   Doesn’t report errors.
-   Doesn’t trim nor collapse whitespace.
    -   But merges adjacent text chunks.
-   Silently ignores comments and processing instructions.
-   Silently ignores undefined entities.
-   Silently ignores text before the first tag.
-   Silently ignores text after the last tag.
-   Silently aborts at EOF-terminated attributes and attribute lists.
-   Silently aborts at expansion of unterminated attribute lists.

---

1. <span id="fn1"></span> [[↑]](#br1), [[↑]](#br2) Probably.

## API

### `fast_xml(src, impl)`

Read an XML document using the provided implementation.

**Arguments:**

-   `src: string` — the XML document source string.
-   `impl: FastBackend` — the backend to use.

**Return:**

-   `Promise<void>` — a promise that resolves on error or document end.

### `FastBackend`

A backend that provides entities table and token hooks.

All the properties and hooks are assumed to be mutable.

All the hooks are called as methods, so it’s safe to use `this` in them.

### `defs`

The entity definitions table.

**Type:**

-   `Map<string, string>`,
-   `undefined`.

Keys are entity names without leading `&` and trailing `;`.

Values are replacements, that are allowed to include markup and other
references. When an entity is referenced in the markup mode, its replacement
will be reparsed as markup with both tags, comments, entity references, etc.
handled as usual. When an entity is referenced in an attribute value, everything
except other references is ignored, including `["']` delimiters that normally
terminate the attribute value.

When filling the table from `<!DOCTYPE>` and/or external DTDs, be careful to
expand numeric references and parametric entities `%...;` **before** adding
entries to the table.

The table is never consulted for numeric and predefined entities:

-   `&#...;`,
-   `&#x...;`,
-   `&lt;`,
-   `&gt;`,
-   `&amp;`,
-   `&apos;`,
-   `&quot;`.

The table is assumed to be mutable, so it’s safe to update or completely replace
it anytime you want.

### `head(head)`

XML prolog hook.

Triggered even if there is no prolog, or it doesn’t include the `<?xml...?>` or
`<!DOCTYPE>` declaration.

Use it to parse the XML declaration and doctype.

The hook can return promise we’ll await, so you can do some async stuff here.

**Arguments:**

-   `head: string` — the XML prolog text.

**Return:**

-   `any` — anything you want, possibly awaitable.

### `otag(tag, attrs)`

Opening tag hook. Also triggered for void tags.

**Arguments:**

-   `tag: string` — the tag name.
-   `attrs: Map<string, string>` — the attributes map.

**Return:**

-   `any` — the return value is ignored.

### `ctag(tag)`

Closing tag hook. For void tags, triggered immediately after the `otag` hook.

**Arguments:**

-   `tag: string` — the tag name.

**Return:**

-   `any` — the return value is ignored.

### `text(text)`

Plain text hook.

Triggered immediately before `otag` or `ctag` with all pending plain text and
<nobr>`<![CDATA[...]]>`</nobr> chunks merged, and only if the merged text is
non-empty.

For example, when parsing a document like
<nobr>`<a>b<!--x-->c<?y?>d<![CDATA[e]]>f</a>`</nobr>, we’ll only trigger `text`
once with the `bcdef` argument.

**Arguments:**

-   `text: string` — the plain text string.

**Return:**

-   `any` — the return value is ignored.

## License

MIT © 2023 Yuri Zemskov
