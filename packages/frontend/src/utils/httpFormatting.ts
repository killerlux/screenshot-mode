import { MessageViewMode } from "@/types";

const INDENT = "  ";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
const MAX_FORMATTED_BODY_LENGTH = 1024 * 1024;
const CONTENT_TYPE_PATTERN = /^content-type\s*:\s*([^;\r\n]+)/im;
const SEPARATOR_PATTERN = /\r?\n\r?\n/;
const JSON_NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const JSON_LITERALS = ["true", "false", "null"] as const;
const JSON_ESCAPES = '"\\/bfnrt';

type HttpMessageParts = {
  body: string;
  contentType: string | undefined;
  head: string;
  newline: "\r\n" | "\n";
  separator: string;
};

function getContentType(head: string): string | undefined {
  return CONTENT_TYPE_PATTERN.exec(head)?.[1]?.trim().toLowerCase();
}

function splitHttpMessage(raw: string): HttpMessageParts | undefined {
  const match = SEPARATOR_PATTERN.exec(raw);
  if (match?.index === undefined) return undefined;

  const head = raw.slice(0, match.index);

  return {
    head,
    separator: match[0],
    body: raw.slice(match.index + match[0].length),
    newline:
      head.includes("\r\n") || match[0].startsWith("\r\n") ? "\r\n" : "\n",
    contentType: getContentType(head),
  };
}

export function getHttpContentType(raw: string): string | undefined {
  return splitHttpMessage(raw)?.contentType ?? getContentType(raw);
}

function readMarkupToken(input: string, start: number): number | undefined {
  if (input.startsWith("<!--", start)) {
    const end = input.indexOf("-->", start + 4);
    return end < 0 ? undefined : end + 3;
  }

  if (input.startsWith("<![CDATA[", start)) {
    const end = input.indexOf("]]>", start + 9);
    return end < 0 ? undefined : end + 3;
  }

  if (input.startsWith("<?", start)) {
    const end = input.indexOf("?>", start + 2);
    return end < 0 ? undefined : end + 2;
  }

  let quote: '"' | "'" | undefined;
  for (let index = start + 1; index < input.length; index++) {
    const character = input[index];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }

  return undefined;
}

function tokenizeMarkup(input: string): string[] | undefined {
  const tokens: string[] = [];
  let position = 0;

  while (position < input.length) {
    const tagStart = input.indexOf("<", position);
    if (tagStart < 0) {
      tokens.push(input.slice(position));
      break;
    }

    if (tagStart > position) tokens.push(input.slice(position, tagStart));

    const tagEnd = readMarkupToken(input, tagStart);
    if (tagEnd === undefined) return undefined;
    tokens.push(input.slice(tagStart, tagEnd));
    position = tagEnd;
  }

  return tokens;
}

function getOpeningTagName(token: string): string | undefined {
  return /^<\s*([^\s/>]+)/.exec(token)?.[1];
}

function getClosingTagName(token: string): string | undefined {
  return /^<\/\s*([^\s>]+)/.exec(token)?.[1];
}

function prettyXml(body: string, newline: string): string | undefined {
  const normalizedBody = body.replace(/^\uFEFF/, "").trim();
  if (!normalizedBody.startsWith("<") || /<!DOCTYPE/i.test(normalizedBody)) {
    return undefined;
  }

  const tokens = tokenizeMarkup(normalizedBody);
  if (tokens === undefined) return undefined;

  const lines: string[] = [];
  const elementStack: string[] = [];
  let elementCount = 0;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? "";
    const trimmedToken = token.trim();
    if (trimmedToken.length === 0) continue;

    const isTag = trimmedToken.startsWith("<");
    const isClosingTag = /^<\//.test(trimmedToken);
    const isStandaloneTag =
      /^<\?/.test(trimmedToken) ||
      /^<!/.test(trimmedToken) ||
      /\/\s*>$/.test(trimmedToken);
    const isOpeningTag = isTag && !isClosingTag && !isStandaloneTag;

    if (!isTag) {
      const nextToken = (tokens[index + 1] ?? "").trim();
      const closingName = getClosingTagName(nextToken);
      const currentName = elementStack.at(-1);
      if (closingName === undefined || closingName !== currentName) {
        return undefined;
      }

      const previousLine = lines.at(-1);
      if (previousLine === undefined) return undefined;
      const textContent = /[\r\n]/.test(token) ? trimmedToken : token;
      lines[lines.length - 1] = `${previousLine}${textContent}${nextToken}`;
      elementStack.pop();
      elementCount++;
      index++;
      continue;
    }

    if (isClosingTag) {
      const closingName = getClosingTagName(trimmedToken);
      if (closingName === undefined || elementStack.pop() !== closingName) {
        return undefined;
      }
    }

    if (!/^<\?/.test(trimmedToken) && !/^<!/.test(trimmedToken)) {
      elementCount++;
    }

    lines.push(`${INDENT.repeat(elementStack.length)}${trimmedToken}`);

    if (isOpeningTag) {
      const openingName = getOpeningTagName(trimmedToken);
      if (openingName === undefined) return undefined;
      elementStack.push(openingName);
    }
  }

  if (elementStack.length !== 0 || elementCount === 0) return undefined;
  return lines.join(newline);
}

function isJsonWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\r" ||
    character === "\n"
  );
}

function prettyJson(body: string, newline: string): string | undefined {
  const source = body.trim();
  const output: string[] = [];
  let position = 0;

  function skipWhitespace(): void {
    while (isJsonWhitespace(source[position])) position++;
  }

  function beginLine(depth: number): void {
    output.push(newline, INDENT.repeat(depth));
  }

  function readString(): boolean {
    if (source[position] !== '"') return false;

    const start = position;
    position++;

    while (position < source.length) {
      const character = source[position];
      if (character === '"') {
        position++;
        output.push(source.slice(start, position));
        return true;
      }

      if (character === "\\") {
        const escape = source[position + 1];
        if (escape === undefined) return false;
        if (escape === "u") {
          const hex = source.slice(position + 2, position + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return false;
          position += 6;
          continue;
        }
        if (!JSON_ESCAPES.includes(escape)) return false;
        position += 2;
        continue;
      }

      if (character === undefined) return false;
      if (character.charCodeAt(0) < 0x20) return false;
      position++;
    }

    return false;
  }

  function readNumber(): boolean {
    JSON_NUMBER_PATTERN.lastIndex = position;
    const match = JSON_NUMBER_PATTERN.exec(source);
    if (match === null) return false;
    position = JSON_NUMBER_PATTERN.lastIndex;
    output.push(match[0]);
    return true;
  }

  function readLiteral(): boolean {
    for (const literal of JSON_LITERALS) {
      if (source.startsWith(literal, position)) {
        output.push(literal);
        position += literal.length;
        return true;
      }
    }
    return false;
  }

  function readValue(depth: number): boolean {
    skipWhitespace();
    const character = source[position];

    if (character === "{") return readObject(depth);
    if (character === "[") return readArray(depth);
    if (character === '"') return readString();
    if (
      character === "-" ||
      (character !== undefined && character >= "0" && character <= "9")
    ) {
      return readNumber();
    }
    return readLiteral();
  }

  function readObject(depth: number): boolean {
    position++;
    skipWhitespace();
    if (source[position] === "}") {
      position++;
      output.push("{}");
      return true;
    }

    output.push("{");

    while (true) {
      beginLine(depth + 1);
      if (!readString()) return false;

      skipWhitespace();
      if (source[position] !== ":") return false;
      position++;
      output.push(": ");

      if (!readValue(depth + 1)) return false;

      skipWhitespace();
      const separator = source[position];
      if (separator === ",") {
        position++;
        output.push(",");
        continue;
      }
      if (separator === "}") {
        position++;
        beginLine(depth);
        output.push("}");
        return true;
      }
      return false;
    }
  }

  function readArray(depth: number): boolean {
    position++;
    skipWhitespace();
    if (source[position] === "]") {
      position++;
      output.push("[]");
      return true;
    }

    output.push("[");

    while (true) {
      beginLine(depth + 1);
      if (!readValue(depth + 1)) return false;

      skipWhitespace();
      const separator = source[position];
      if (separator === ",") {
        position++;
        output.push(",");
        continue;
      }
      if (separator === "]") {
        position++;
        beginLine(depth);
        output.push("]");
        return true;
      }
      return false;
    }
  }

  try {
    if (!readValue(0)) return undefined;
    skipWhitespace();
    if (position !== source.length) return undefined;
  } catch {
    return undefined;
  }

  return output.join("");
}

function prettyForm(body: string, newline: string): string | undefined {
  if (!body.includes("&")) return undefined;
  return body.split("&").join(`${newline}&`);
}

function isJsonContentType(contentType: string): boolean {
  return contentType.endsWith("/json") || contentType.endsWith("+json");
}

function isXmlContentType(contentType: string): boolean {
  return contentType.endsWith("/xml") || contentType.endsWith("+xml");
}

function formatBody(
  body: string,
  newline: string,
  contentType: string | undefined,
): string | undefined {
  const trimmedBody = body.trimStart();

  if (contentType !== undefined) {
    if (isJsonContentType(contentType)) return prettyJson(body, newline);
    if (isXmlContentType(contentType)) return prettyXml(body, newline);
    if (contentType === FORM_CONTENT_TYPE) return prettyForm(body, newline);
    return undefined;
  }

  if (trimmedBody.startsWith("{") || trimmedBody.startsWith("[")) {
    return prettyJson(body, newline);
  }

  if (trimmedBody.startsWith("<?xml")) return prettyXml(body, newline);

  return undefined;
}

export function formatHttpMessage(
  raw: string,
  mode: MessageViewMode,
  contentTypeHint?: string,
): string {
  if (mode !== MessageViewMode.Pretty) return raw;

  const parts = splitHttpMessage(raw);
  if (parts === undefined || parts.body.trim().length === 0) return raw;
  if (parts.body.length > MAX_FORMATTED_BODY_LENGTH) return raw;

  const formattedBody = formatBody(
    parts.body,
    parts.newline,
    contentTypeHint ?? parts.contentType,
  );
  if (formattedBody === undefined) return raw;

  return `${parts.head}${parts.separator}${formattedBody}`;
}
