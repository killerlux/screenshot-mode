import { describe, expect, it } from "vitest";

import { formattingDropsRedactions } from "./decorations";

import {
  MatchMode,
  RedactionMode,
  type RedactionRule,
  RuleTarget,
} from "@/types";

function redaction(regex: string): RedactionRule {
  return {
    id: "r1",
    regex,
    target: RuleTarget.Request,
    mode: RedactionMode.Replace,
    replacementText: "[REDACTED]",
    useCaptureGroups: false,
    selectedGroups: [],
    matchMode: MatchMode.String,
  };
}

describe("formattingDropsRedactions", () => {
  it("detects a compact rule losing its match when Pretty adds a space", () => {
    const source = '{"user":"demo","password":"demo-secret"}';
    const displayed = '{\n  "user": "demo",\n  "password": "demo-secret"\n}';

    expect(
      formattingDropsRedactions(source, displayed, [
        redaction('"password":"demo-secret"'),
      ]),
    ).toBe(true);
  });

  it("accepts a rule that still matches in both layouts", () => {
    const source = '{"password":"demo-secret"}';
    const displayed = '{\n  "password": "demo-secret"\n}';

    expect(
      formattingDropsRedactions(source, displayed, [
        redaction('"password": "demo-secret"'),
      ]),
    ).toBe(false);
  });

  it("detects a regex rule that matches different text with the same count", () => {
    const source = '{"password":"secret","public":"ok"}';
    const displayed = '{\n  "password": "secret",\n  "public": "ok"\n}';
    const unionRule = {
      ...redaction('"password":"secret"|"public": "ok"'),
      matchMode: MatchMode.Regex,
    };

    expect(formattingDropsRedactions(source, displayed, [unionRule])).toBe(
      true,
    );
  });

  it("accepts a regex rule whose matches survive with new whitespace", () => {
    const source = '{"password":"secret"}';
    const displayed = '{\n  "password": "secret"\n}';
    const rule = {
      ...redaction('"password":\\s*"secret"'),
      matchMode: MatchMode.Regex,
    };

    expect(formattingDropsRedactions(source, displayed, [rule])).toBe(false);
  });

  it("ignores rules that never matched the source", () => {
    expect(
      formattingDropsRedactions("hello", "hello", [redaction("not-present")]),
    ).toBe(false);
  });

  it("does not treat an invalid pattern as a lost redaction", () => {
    const rule = redaction("(");
    const regexRule = { ...rule, matchMode: MatchMode.Regex };

    expect(formattingDropsRedactions("a", "a", [regexRule])).toBe(false);
  });
});
