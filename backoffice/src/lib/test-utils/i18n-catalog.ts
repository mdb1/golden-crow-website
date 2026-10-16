// i18n-catalog.ts
//
// Test-only helpers behind the next-intl catalog guards
// (`src/lib/__tests__/i18n-catalog-parity.test.ts` and
// `src/lib/__tests__/i18n-literal-keys.test.ts`).
//
// Two pieces:
//
//   1. `icuSignature(message)` — a small ICU MessageFormat reader that returns the
//      ARGUMENT names (`{name}`, `{n, number}`, `{count, plural, …}`) and the rich-text
//      TAG names (`<strong>…</strong>`) a message expects. Plural / select branch
//      selectors (`one`, `other`, `=0`, `male`) and branch TEXT are not arguments; an
//      argument nested inside a branch is. Apostrophe quoting follows
//      intl-messageformat (the runtime next-intl uses): `'` only opens a quote when the
//      next char is `{ } < >` (or `#` inside a plural), and `''` is a literal `'`.
//      That is why "{client}'s birthday" has exactly one argument.
//
//   2. `scanTranslationCalls(file, source)` — parses a .ts/.tsx file with SWC (the
//      transform Jest already uses, so no new dependency) and returns every call made
//      through a translator bound by `useTranslations("ns")` / `getTranslations("ns")`
//      (including `getTranslations({ namespace })` and the `Promise.all([...])`
//      destructuring form). Scope is resolved through SWC's syntax contexts, so a
//      helper parameter that happens to be called `t` is never mistaken for the
//      component's translator.

import { parseSync } from "@swc/core";

// ── 1. ICU ────────────────────────────────────────────────────────────────────

export interface IcuSignature {
  args: string[];
  tags: string[];
}

export class IcuParseError extends Error {}

const BRANCHING_TYPES = new Set(["plural", "selectordinal", "select"]);

export function icuSignature(message: string): IcuSignature {
  const args = new Set<string>();
  const tags = new Set<string>();
  let i = 0;
  const n = message.length;

  const isWs = (c: string | undefined) => c !== undefined && /\s/.test(c);
  const skipWs = () => {
    while (i < n && isWs(message[i])) i += 1;
  };
  const fail = (why: string): never => {
    throw new IcuParseError(`${why} at ${i} in ${JSON.stringify(message)}`);
  };

  // Parses message text until `}` (when nested) or end of input.
  function parseText(nested: boolean, inPlural: boolean): void {
    while (i < n) {
      const c = message[i];
      if (c === "'") {
        const next = message[i + 1];
        if (next === "'") {
          i += 2;
          continue;
        }
        if (next === "{" || next === "}" || next === "<" || next === ">" || (inPlural && next === "#")) {
          // Quoted literal: runs to the next lone apostrophe (or end of message).
          i += 2;
          while (i < n) {
            if (message[i] === "'") {
              if (message[i + 1] === "'") {
                i += 2;
                continue;
              }
              i += 1;
              break;
            }
            i += 1;
          }
          continue;
        }
        i += 1;
        continue;
      }
      if (c === "{") {
        i += 1;
        parseArgument(inPlural);
        continue;
      }
      if (c === "}") {
        if (nested) return;
        fail("unbalanced '}'");
      }
      if (c === "<") {
        const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9_-]*)\s*>/.exec(message.slice(i));
        if (m) {
          if (!m[1]) tags.add(m[2]);
          i += m[0].length;
          continue;
        }
      }
      i += 1;
    }
    if (nested) fail("unterminated '{'");
  }

  function readIdent(): string {
    const start = i;
    while (i < n && !isWs(message[i]) && message[i] !== "," && message[i] !== "}" && message[i] !== "{") i += 1;
    return message.slice(start, i);
  }

  function parseArgument(inPlural: boolean): void {
    skipWs();
    const name = readIdent();
    if (!name) fail("empty argument name");
    args.add(name);
    skipWs();
    if (message[i] === "}") {
      i += 1;
      return;
    }
    if (message[i] !== ",") fail(`expected ',' or '}' after argument ${name}`);
    i += 1;
    skipWs();
    const type = readIdent();
    skipWs();
    if (BRANCHING_TYPES.has(type)) {
      if (message[i] !== ",") fail(`expected ',' after ${type}`);
      i += 1;
      skipWs();
      if (message.startsWith("offset:", i)) {
        i += "offset:".length;
        skipWs();
        readIdent();
        skipWs();
      }
      let branches = 0;
      while (i < n && message[i] !== "}") {
        const selector = readIdent();
        if (!selector) fail(`expected a ${type} selector`);
        skipWs();
        if (message[i] !== "{") fail(`expected '{' after selector ${selector}`);
        i += 1;
        parseText(true, type !== "select" || inPlural);
        if (message[i] !== "}") fail("unterminated branch");
        i += 1;
        branches += 1;
        skipWs();
      }
      if (message[i] !== "}") fail(`unterminated ${type}`);
      if (branches === 0) fail(`${type} without branches`);
      i += 1;
      return;
    }
    // number / date / time (optionally with a style): skip to the matching brace.
    let depth = 1;
    while (i < n && depth > 0) {
      if (message[i] === "{") depth += 1;
      else if (message[i] === "}") depth -= 1;
      i += 1;
    }
    if (depth !== 0) fail(`unterminated ${type || "argument"}`);
  }

  parseText(false, false);
  return { args: [...args].sort(), tags: [...tags].sort() };
}

// ── catalog helpers ───────────────────────────────────────────────────────────

export type Catalog = { [key: string]: string | Catalog };

/** Leaf keys as dotted paths → message. */
export function flattenCatalog(catalog: Catalog, prefix = "", out = new Map<string, unknown>()) {
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenCatalog(value as Catalog, path, out);
    } else {
      out.set(path, value);
    }
  }
  return out;
}

/** The node at a dotted path (leaf string or sub-object), or undefined. */
export function catalogNodeAt(catalog: Catalog, dotted: string): unknown {
  let cur: unknown = catalog;
  for (const part of dotted.split(".")) {
    if (!cur || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, part)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// ── 2. source scan ────────────────────────────────────────────────────────────

export interface TranslationCall {
  file: string;
  namespace: string;
  /** "t" | "rich" | "raw" | "markup" | "has" */
  method: string;
  /** Literal keys (a ternary of two literals yields two). Empty for a dynamic key. */
  keys: string[];
  dynamic: boolean;
}

export interface ScanResult {
  calls: TranslationCall[];
  /** `useTranslations(...)` / `getTranslations(...)` calls whose binding shape the
   *  scanner does not understand — reported so new shapes are not silently ignored. */
  unrecognizedBindings: string[];
}

type Node = { type?: string; [key: string]: unknown };
type Ident = { type: "Identifier"; value: string; ctxt: number };

const HOOKS = new Set(["useTranslations", "getTranslations"]);
const METHODS = new Set(["rich", "raw", "markup", "has"]);

function walk(node: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== "object") return;
  visit(node as Node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "span") continue;
    if (value && typeof value === "object") walk(value, visit);
  }
}

function unwrap(expr: Node | undefined | null): Node | undefined {
  let cur = expr ?? undefined;
  while (cur && (cur.type === "AwaitExpression" || cur.type === "ParenthesisExpression" || cur.type === "TsAsExpression")) {
    cur = (cur.type === "AwaitExpression" ? cur.argument : cur.expression) as Node;
  }
  return cur;
}

function isHookCall(expr: Node | undefined): expr is Node {
  if (!expr || expr.type !== "CallExpression") return false;
  const callee = expr.callee as Node;
  return callee?.type === "Identifier" && HOOKS.has(callee.value as string);
}

/** Namespace literal of a hook call, or null when it is not a literal. */
function hookNamespace(call: Node): string | null {
  const args = call.arguments as Array<{ expression: Node }>;
  const first = args[0]?.expression;
  if (!first) return "";
  if (first.type === "StringLiteral") return first.value as string;
  if (first.type === "ObjectExpression") {
    for (const prop of first.properties as Node[]) {
      if (prop.type !== "KeyValueProperty") continue;
      const key = prop.key as Node;
      const keyName = key.type === "Identifier" ? key.value : key.type === "StringLiteral" ? key.value : null;
      if (keyName === "namespace") {
        const v = prop.value as Node;
        return v.type === "StringLiteral" ? (v.value as string) : null;
      }
    }
    return "";
  }
  return null;
}

function literalKeys(expr: Node | undefined): string[] | null {
  const e = unwrap(expr);
  if (!e) return null;
  if (e.type === "StringLiteral") return [e.value as string];
  if (e.type === "TemplateLiteral" && (e.expressions as unknown[]).length === 0) {
    const quasis = e.quasis as Array<{ cooked?: string; raw: string }>;
    return [quasis[0]?.cooked ?? quasis[0]?.raw ?? ""];
  }
  if (e.type === "ConditionalExpression") {
    const a = literalKeys(e.consequent as Node);
    const b = literalKeys(e.alternate as Node);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

export function scanTranslationCalls(file: string, source: string): ScanResult {
  const ast = parseSync(source, {
    syntax: "typescript",
    tsx: file.endsWith(".tsx"),
    comments: false,
  });

  // (name, ctxt) → namespace
  const bindings = new Map<string, string>();
  const recognized = new Set<Node>();
  const unrecognizedBindings: string[] = [];
  const bindingKey = (id: Ident) => `${id.value}#${id.ctxt}`;

  walk(ast, (node) => {
    if (node.type !== "VariableDeclarator") return;
    const id = node.id as Node;
    const init = unwrap(node.init as Node);
    if (id.type === "Identifier" && isHookCall(init)) {
      const ns = hookNamespace(init);
      if (ns !== null) {
        bindings.set(bindingKey(id as unknown as Ident), ns);
        recognized.add(init);
      }
      return;
    }
    // const [t, x] = await Promise.all([getTranslations("ns"), …])
    if (
      id.type === "ArrayPattern" &&
      init?.type === "CallExpression" &&
      (init.callee as Node).type === "MemberExpression"
    ) {
      const callee = init.callee as Node;
      const obj = callee.object as Node;
      const prop = callee.property as Node;
      if (obj.type !== "Identifier" || obj.value !== "Promise" || prop.value !== "all") return;
      const arr = unwrap((init.arguments as Array<{ expression: Node }>)[0]?.expression);
      if (arr?.type !== "ArrayExpression") return;
      const elements = arr.elements as Array<{ expression: Node } | null>;
      const pats = id.elements as Array<Node | null>;
      elements.forEach((el, idx) => {
        const call = unwrap(el?.expression);
        const pat = pats[idx];
        if (isHookCall(call) && pat?.type === "Identifier") {
          const ns = hookNamespace(call);
          if (ns !== null) {
            bindings.set(bindingKey(pat as unknown as Ident), ns);
            recognized.add(call);
          }
        }
      });
    }
  });

  walk(ast, (node) => {
    if (isHookCall(node) && !recognized.has(node)) {
      unrecognizedBindings.push(`${file}: ${(node.callee as Node).value}(…) bound in an unsupported shape`);
    }
  });

  const calls: TranslationCall[] = [];
  walk(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = node.callee as Node;
    let target: Node | undefined;
    let method = "t";
    if (callee.type === "Identifier") {
      target = callee;
    } else if (callee.type === "MemberExpression") {
      const prop = callee.property as Node;
      if (prop.type === "Identifier" && METHODS.has(prop.value as string)) {
        target = callee.object as Node;
        method = prop.value as string;
      }
    }
    if (!target || target.type !== "Identifier") return;
    const ns = bindings.get(bindingKey(target as unknown as Ident));
    if (ns === undefined) return;
    const keys = literalKeys((node.arguments as Array<{ expression: Node }>)[0]?.expression);
    calls.push({ file, namespace: ns, method, keys: keys ?? [], dynamic: keys === null });
  });

  return { calls, unrecognizedBindings };
}

/** Full catalog path for a key under a namespace ("" = root). */
export function qualifiedKey(namespace: string, key: string): string {
  return namespace ? `${namespace}.${key}` : key;
}
