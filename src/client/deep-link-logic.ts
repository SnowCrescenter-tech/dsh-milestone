/**
 * Pure deep-link helpers for the milestone rail: parse the `#msg=<key>` URL
 * hash and rebuild it.
 *
 * The conversation anchor key is treated as an OPAQUE string — it is a
 * length-prefixed node key like `13:input-message<messageId>` or
 * `14:assistant-step3:2` (the length prefix makes naive splitting ambiguous),
 * so the parser never inspects or splits the key itself. Callers match the
 * returned key against the session's marks, which is the real validity check.
 *
 * Percent-encoding: the URL fragment parser percent-encodes `"` `<` `>` `` ` ``
 * and lone `%`, so a hash built with a RAW `<`-containing key would read back
 * from `location.hash` percent-encoded (`13:user%3Cdl-2%3E`) and never match
 * a mark after a refresh. `buildMessageHash` therefore percent-encodes those
 * characters itself (a byte-exact URL), and `parseDeepLinkHash` decodes them
 * back — the key round-trips through the URL untouched.
 */

/** The URL hash fragment prefix that carries a message anchor key. */
const MSG_HASH_PREFIX = 'msg='

/**
 * Characters the WHATWG URL fragment parser cannot round-trip raw (they are
 * percent-encoded on parse): `"` (0x22), `<` (0x3C), `>` (0x3E), backtick
 * (0x60), and `%` (0x25, so a literal `%` never reads as an escape start).
 */
const FRAGMENT_UNSAFE = /["<>\u0060%]/g

/**
 * Parse a `location.hash` fragment into the message anchor key it references.
 * @param hash - the raw `location.hash` value: `''` or a fragment starting
 *   with `#` (e.g. `#msg=13:input-messageabc`).
 * @returns the anchor key (percent-escapes decoded), or null when the
 *   fragment is not a message deep link: empty hash, `#msg=` with an empty
 *   value, a `#msg` prefix without the `=`, any other hash shape, a hash
 *   missing the leading `#`, or a malformed percent escape.
 */
export function parseDeepLinkHash(hash: string): string | null {
  if (!hash.startsWith(`#${MSG_HASH_PREFIX}`)) return null
  const encoded = hash.slice(MSG_HASH_PREFIX.length + 1)
  if (encoded === '') return null
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

/**
 * Build the URL hash fragment that deep-links to a message anchor key.
 * @param key - the conversation node key (opaque, never parsed here).
 */
export function buildMessageHash(key: string): string {
  // Percent-encode the URL-fragment-unsafe characters so the hash written to
  // the URL is byte-exact and survives a refresh (see module docs).
  return `#${MSG_HASH_PREFIX}${key.replace(FRAGMENT_UNSAFE, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}
