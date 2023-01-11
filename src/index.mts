/**
 * @author Yuri Zemskov <miyaokamarina@gmail.com> (https://twitter.com/miyaokamarina)
 * @copyright © 2023 Yuri Zemskov
 *
 * @license MIT
 *
 * SPDX-License-Identifier: MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the “Software”), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Match any number of:
 *  -  whitespace or whatever `[^<]+`,
 *  -  comments `<--...-->`,
 *  -  processing instructions `<?...?>`,
 *  -  doctype-like declarations `<!...>`.
 */
const PROLOG = /^(?:<!(?:"[^"]*"|'[^']*'|<(?:"[^"]*"|'[^']*'|[^>]+)*>|[^<>"']+)*>|<!-.*?-->|<\?.*?\?>|[^<]+)*/sy;

/**
 * Top-level microsyntax:
 *  -  entity reference `&...;`,
 *  -  cdata section `<![...]]>`,
 *  -  comment `<!--...-->`,
 *  -  processing instruction `<?...?>`,
 *  -  opening or void tag `<...`,
 *  -  closing tag `</...`
 *  -  plain text `[^<&]+`.
 */
const PRIMARY = /&[^;]+;|<!\[.*?\]\]>|<!-.*?-->|<\?.*?\?>|<\/?[^/> \t\r\n]+|[^<&]+/sy;

/**
 * Attributes list microsyntax:
 *  -  attlist end `/>`, `>`,
 *  -  whitespace `[ \t\r\n]+`,
 *  -  attribute begin `...=["']`.
 */
const ATTLIST = /\/?>|[ \t\r\n]+|[^=]+=["']/y;

/**
 * Double-quoted literal microsyntax:
 *  -  entity reference `&...;`,
 *  -  end delimiter `"`,
 *  -  plain text `[^"&]`.
 */
const DQ_ATTR = /&[^;]+;|"|[^"&]+/y;

/**
 * Single-quoted literal microsyntax:
 *  -  entity reference `&...;`,
 *  -  end delimiter `'`,
 *  -  plain text `[^'&]`.
 */
const SQ_ATTR = /&[^;]+;|'|[^'&]+/y;

/**
 * Literal microsyntax in the replacement expansion mode:
 *  -  entity reference `&...;`,
 *  -  plain text `[^&]`.
 */
const RX_ATTR = /&[^;]+;|[^&]+/y;

/**
 * Predefined entities.
 */
const PREDEFINED: Map<string, string> = /*#__PURE__#*/ new Map([
    ['lt', '<'],
    ['gt', '>'],
    ['amp', '&'],
    ['apos', "'"],
    ['quot', '"'],
]);

/**
 * Fast XML reader backend.
 *
 * All the properties and hooks are assumed to be mutable.
 *
 * All the hooks are called as methods, so it’s safe to use `this` in them.
 */
export interface FastBackend {
    /**
     * The entity definitions table.
     *
     * Keys are entity names without leading `&` and trailing `;`.
     * Values are replacements, that are allowed to include markup and other references.
     *
     * When parsing `<!DOCTYPE>` and external DTDs,
     * be careful to process numeric references and parametric entities `%...;`
     * **before** adding entries to the table.
     *
     * The table is never consulted for numeric and predefined entities:
     *  -  `&#...;`,
     *  -  `&#x...;`,
     *  -  `&lt;`,
     *  -  `&gt;`,
     *  -  `&amp;`,
     *  -  `&apos;`,
     *  -  `&quot;`.
     *
     * The table is assumed to be mutable, so it’s safe to update
     * or completely replace it anytime you want.
     */
    defs?: Map<string, string> | undefined;

    /**
     * XML prolog hook. Triggered even if there is no prolog
     * or it doesn’t include the `<?xml...?>` or `<!DOCTYPE>` declaration.
     *
     * Use it to parse the XML declaration and doctype.
     *
     * The hook can return promise we’ll await,
     * so you can do some async stuff here.
     *
     * @param head The prolog text.
     */
    head?(head: string): void | Promise<void>;

    /**
     * Opening tag hook. Also triggered for void tags.
     *
     * @param tag The tag name.
     * @param attrs The attributes map.
     */
    otag?(tag: string, attrs: Map<string, string>): void;

    /**
     * Closing tag hook.
     * For void tags, triggered immediately after the `otag` hook.
     *
     * @param tag The tag name.
     */
    ctag?(tag: string): void;

    /**
     * Plain text hook.
     *
     * All adjacent plain text chunks and `<![CDATA[..]]>` sections
     * are merged before the hook call.
     *
     * For example, when parsing the document `<a>b<!--x-->c<?y?>d<![CDATA[e]]>f</a>`,
     * we’ll only trigger it once with the `bcdef` text.
     *
     * We also will not trigger it with empty text.
     *
     * @param text The plain text chunk.
     */
    text?(text: string): void;
}

/**
 * Read an XML document.
 *
 * @param src The XML source string.
 * @param impl The backend implementation.
 */
export const fast_xml = async (src: string, impl: FastBackend) => {
    type Frame = [src: string, pos: number, lit: RegExp, end: string];

    /**
     * Return to the previous entity expansion stack frame.
     */
    let back = (_?: void) => {
        names.pop(); //              Pop the current entity name.
        let frame = stack.pop()!; // Get the previous state snapshot.

        src = frame[0]; //           And then restore it.
        pos = frame[1];
        lit = frame[2];
        end = frame[3];
    };

    /**
     * Expand numeric or named reference.
     *
     * @param ref The reference code or name to expand.
     */
    let expand = (ref: string) => {
        if (ref[0] === '#') {
            // Numeric reference:
            // &#...;
            // &#x...;

            let code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1));

            if (code >= 0 && code < 0x110000) {
                // Valid code point:
                text += String.fromCodePoint(code);
            } else {
                // Something went wrong:
                active = false;
            }
        } else if (PREDEFINED.has(ref)) {
            // Predefined entity:
            // &lt;
            // &gt;
            // &amp;
            // &apos;
            // &quot;
            text += PREDEFINED.get(ref);
        } else if (!names.includes(ref) && impl.defs?.has(ref)) {
            // Non-recursive, defined, and non-empty named reference:
            // &{id};

            // Mark the current name to avoid recursion:
            names.push(ref);

            // Save the current state, and replace the source:
            stack.push([src, pos, lit, end]);
            src = impl.defs.get(ref)!;
            pos = 0;

            // In case we’re in the attribute mode,
            // replace the literal microsyntax
            // and the end delimiter:
            lit = RX_ATTR;
            end = '';
        }
    };

    /** Tokenizer position.      */ let pos: number;

    /** Literal microsyntax.     */ let lit: RegExp;
    /** Attr end delim.          */ let end: string;

    /** State snapshots stack.   */ let stack: Frame[] = [];
    /** Pending ref names.       */ let names: string[] = [];

    /** Tag or attr text buffer. */ let text = '';

    /** Loop condition.          */ let active = true;

    // Fast forward to the first tag:
    PROLOG.lastIndex = 0;
    PROLOG.test(src);
    pos = PROLOG.lastIndex;

    // Trigger the `head` hook:
    await impl.head?.(src.slice(0, pos));

    while (active) {
        PRIMARY.lastIndex = pos;
        if (PRIMARY.test(src)) {
            // A top-level token:
            //  -  `<{name}`, `</{name}...>`,
            //  -  `<![CDATA[...]]>`,
            //  -  `<!--...-->`,
            //  -  `<?...?>`,
            //  -  `&...;`,
            //  -  plain text chunk.

            let tok = src.slice(pos, (pos = PRIMARY.lastIndex));

            if (tok[0] === '<') {
                if (tok[1] === '/') {
                    // </{name}...>

                    // Flush the text buffer:
                    if (text) impl.text?.(text);
                    text = '';

                    // Fast forward to the right angle:
                    let end = src.indexOf('>', pos);

                    if (end < 0) {
                        // Abort, if there is no right angle:
                        active = false;
                    } else {
                        // Trigger the `ctag` hook,
                        // and advance to the next position:
                        impl.ctag?.(tok.slice(2));
                        pos = end + 1;
                    }
                } else if (tok[1] === '!' && tok[2] === '[') {
                    // <![CDATA[...]]>
                    text += tok.slice(9, -3);
                } else if (tok[1] !== '!' && tok[1] !== '?') {
                    // <{name}

                    // Flush the text buffer:
                    if (text) impl.text?.(text);
                    text = '';

                    let tag = tok.slice(1); // Capture the tag name.
                    let attrs = new Map(); //  Create the attrs map.

                    // Then tokenize the attributes list:
                    while (active) {
                        ATTLIST.lastIndex = pos;
                        if (ATTLIST.test(src)) {
                            // An attlist token:
                            //  -  `{name}="`,
                            //  -  `{name}='`,
                            //  -  `{ws}`,
                            //  -  `/>`,
                            //  -  `>`.
                            tok = tok = src.slice(pos, (pos = ATTLIST.lastIndex));

                            if (tok === '/>' || tok === '>') {
                                // Attlist end:
                                //  -  `/>`,
                                //  -  `>`.

                                // The tag and its attrs are ready,
                                // trigger the `otag` hook:
                                impl.otag?.(tag, attrs);

                                // Trigger the `ctag` hook of the void tag:
                                if (tok !== '>') impl.ctag?.(tag);

                                // Switch back to the top-level mode:
                                break;
                            } else if (tok.at(-2) === '=') {
                                // Attribute name, plus the literal quote:
                                //  -  `{name}="`,
                                //  -  `{name}='`.

                                let attr = tok.slice(0, -2); //           Capture the attr name.

                                end = tok.at(-1)!; //                     Get the literal delimiter.
                                lit = end === '"' ? DQ_ATTR : SQ_ATTR; // Select an appropriate literal microsyntax.

                                // Then tokenize the literal:
                                while (active) {
                                    lit.lastIndex = pos;
                                    if (lit.test(src)) {
                                        // A literal token:
                                        //  -  `&...;`,
                                        //  -  `"` or `'`,
                                        //  -  plain text chunk.

                                        tok = src.slice(pos, (pos = lit.lastIndex));

                                        if (tok === end) {
                                            // " or '

                                            attrs.set(attr, text); // Write the attribute value.
                                            text = ''; //             Reset the text buffer.
                                            break; //                 Switch back to the attlist mode.

                                            // NB: In the expansion mode, `end` is an empty string,
                                            //     and since `tok` cannot be empty,
                                            //     this branch is only reachable in the top-level mode.
                                        } else if (tok[0] === '&') {
                                            // &...;
                                            expand(tok.slice(1, -1));
                                        } else {
                                            // Plain text chunk.
                                            // Just append it to the buffer:
                                            text += tok;
                                        }
                                    } else if (stack.length) {
                                        // No match in the literal mode,
                                        // AND the stack is non-empty.
                                        // It’s an end of replacement;
                                        // just go back to the previous stackframe:
                                        back();
                                    } else {
                                        // EOF or error:
                                        // Just abort silently:
                                        active = false;
                                    }
                                }
                            }
                        } else {
                            // End of replacement or EOF.
                            // Just abort silently:
                            active = false;

                            // NB: If replacement ends mid-attlist,
                            //     it’s always a fatal error,
                            //     and there is no need to handle it.
                        }
                    }
                }
            } else if (tok[0] === '&') {
                // &...;
                expand(tok.slice(1, -1));
            } else {
                // Plain text chunk.
                // Just buffer it:
                text += tok;
            }
        } else if (stack.length) {
            // No match in the top-level mode,
            // AND the stack is non-empty.
            // It’s an end of replacement;
            // just go back to the previous stackframe:
            back();
        } else {
            // EOF or error:
            // Nothing special, just abort silently:
            active = false;
        }
    }
};
