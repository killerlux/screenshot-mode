import { describe, expect, it } from "vitest";

import { escapeLiteralPattern } from "./regex";

describe("escapeLiteralPattern", () => {
  it("escapes regular expression metacharacters", () => {
    expect(escapeLiteralPattern("a+b(c)[d]")).toBe("a\\+b\\(c\\)\\[d\\]");
  });

  it("tolerates whitespace added or removed by formatting", () => {
    const selectedInPretty = '"password": "demo-secret"';
    const compactRaw = '{"user":"demo","password":"demo-secret","ok":true}';

    const pattern = escapeLiteralPattern(selectedInPretty);

    expect(new RegExp(pattern).test(compactRaw)).toBe(true);
  });

  it("tolerates re-indentation of a multi-line selection", () => {
    const selectedInRaw =
      '"items": [\r\n      {\r\n        "sku": "DEMO-001"\r\n      }\r\n    ]';
    const prettyBody = [
      "{",
      '  "items": [',
      "    {",
      '      "sku": "DEMO-001"',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    const pattern = escapeLiteralPattern(selectedInRaw);

    expect(new RegExp(pattern).test(prettyBody)).toBe(true);
  });

  it("does not turn a selection into a wildcard match", () => {
    const pattern = escapeLiteralPattern("password");

    expect(new RegExp(pattern).test("password")).toBe(true);
    expect(new RegExp(pattern).test('"password":"x"')).toBe(true);
    expect(new RegExp(pattern).test("passphrase")).toBe(false);
    expect(new RegExp(pattern).test("pass-code")).toBe(false);
  });
});
