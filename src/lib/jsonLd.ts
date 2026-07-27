/**
 * Serialize JSON-LD for an inline script without allowing data to terminate the
 * script element. Escaping every "<" keeps closing tags in untrusted values
 * from being interpreted by the HTML parser.
 */
export function serializeJsonLd(value: unknown): string {
  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new TypeError("JSON-LD must be serializable");
  }

  return json
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
