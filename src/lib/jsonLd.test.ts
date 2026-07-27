import { describe, expect, it } from "vitest";

import { serializeJsonLd } from "./jsonLd";

describe("serializeJsonLd", () => {
  it("keeps script-closing content inert while preserving its value", () => {
    const payload =
      "</script><script>globalThis.compromised = true</script>\u2028\u2029";
    const serialized = serializeJsonLd({ name: payload });
    const document = `<script type="application/ld+json">${serialized}</script>`;

    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain("\u2028");
    expect(serialized).not.toContain("\u2029");
    expect(document.match(/<script/gi)).toHaveLength(1);
    expect(document.match(/<\/script>/gi)).toHaveLength(1);
    expect(JSON.parse(serialized)).toEqual({ name: payload });
  });
});
