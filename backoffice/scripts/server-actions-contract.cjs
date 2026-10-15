#!/usr/bin/env node
// server-actions-contract.cjs — the list of Server Actions a deployed page may
// call, and the guard that keeps a deploy from breaking tabs opened before it.
//
// WHY (#382). Next.js hashes each action's ID from the build key + its FILE +
// its EXPORT NAME (+ which arguments it uses). A tab opened before a deploy
// keeps posting the IDs it was rendered with, so renaming, moving or re-shaping
// an action in use breaks every such tab on its next save. The fix is a rule —
// keep the old action exported for at least one deploy — and this file makes
// the rule impossible to break by accident:
//
//   backoffice/server-actions.contract.json
//     "actions": every exported function of every "use server" module, with
//                its file, name and parameter shape. Must match the source
//                EXACTLY (src/lib/__tests__/server-actions-contract.test.ts).
//     "retired": actions removed on purpose, with the date. Moving an entry
//                here is the reviewable act of "this one may now disappear".
//
// Usage (from backoffice/):
//   node scripts/server-actions-contract.cjs           print the current list
//   node scripts/server-actions-contract.cjs --write   rewrite the contract:
//       new actions are added; actions that vanished move to "retired" with
//       today's date. Review that diff: a retired action must have been
//       replaced at least one deploy earlier (old + new exported together).
//
// The authoritative end-to-end check (two real builds, IDs compared) is
// scripts/check-deploy-skew.sh; this is the fast, always-on part of it.

const fs = require("node:fs");
const path = require("node:path");
const { parseSync } = require("@swc/core");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const CONTRACT = path.join(ROOT, "server-actions.contract.json");

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "node_modules"
        ? []
        : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")
      ? [full]
      : [];
  });
}

function isUseServerDirective(stmt) {
  return (
    stmt &&
    stmt.type === "ExpressionStatement" &&
    stmt.expression.type === "StringLiteral" &&
    stmt.expression.value === "use server"
  );
}

/** "(formData)", "(a, b?, ...rest)" — the shape Next folds into the ID. */
function paramShape(params) {
  return params
    .map((p) => {
      const pat = p.pat ?? p; // FunctionDeclaration params are { pat }, arrows are patterns
      if (pat.type === "RestElement") return "...rest";
      if (pat.type === "AssignmentPattern") return "optional";
      if (pat.type === "Identifier" && pat.optional) return "optional";
      return "arg";
    })
    .join(", ");
}

function functionOf(expr) {
  if (!expr) return null;
  if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") {
    return expr;
  }
  // `cache(async (...) => …)` / `wrap(fn)`: look at the first function argument.
  if (expr.type === "CallExpression") {
    for (const arg of expr.arguments) {
      const fn = functionOf(arg.expression);
      if (fn) return fn;
    }
  }
  if (expr.type === "TsAsExpression" || expr.type === "TsSatisfiesExpression") {
    return functionOf(expr.expression);
  }
  return null;
}

function actionsIn(file) {
  const code = fs.readFileSync(file, "utf8");
  const ast = parseSync(code, {
    syntax: "typescript",
    tsx: file.endsWith(".tsx"),
  });
  if (!isUseServerDirective(ast.body[0])) return [];
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const out = [];
  for (const item of ast.body) {
    if (item.type === "ExportDeclaration") {
      const decl = item.declaration;
      if (decl.type === "FunctionDeclaration") {
        out.push({ file: rel, export: decl.identifier.value, params: paramShape(decl.params) });
      } else if (decl.type === "VariableDeclaration") {
        for (const d of decl.declarations) {
          const fn = functionOf(d.init);
          out.push({
            file: rel,
            export: d.id.value,
            params: fn ? paramShape(fn.params) : "unknown",
          });
        }
      }
    } else if (item.type === "ExportNamedDeclaration" && !item.typeOnly) {
      for (const spec of item.specifiers) {
        if (spec.isTypeOnly) continue;
        const name = (spec.exported ?? spec.orig).value;
        out.push({ file: rel, export: name, params: "unknown" });
      }
    } else if (item.type === "ExportDefaultDeclaration" || item.type === "ExportDefaultExpression") {
      out.push({ file: rel, export: "default", params: "unknown" });
    }
  }
  return out;
}

function collectActions() {
  return sourceFiles(SRC)
    .flatMap(actionsIn)
    .sort((a, b) => (a.file + "#" + a.export).localeCompare(b.file + "#" + b.export));
}

function readContract() {
  if (!fs.existsSync(CONTRACT)) return { actions: [], retired: [] };
  return JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
}

const key = (a) => `${a.file}#${a.export}`;

/** Differences between the source and the contract, grouped by severity. */
function diffContract(current, contract) {
  const now = new Map(current.map((a) => [key(a), a]));
  const was = new Map(contract.actions.map((a) => [key(a), a]));
  const retired = new Set((contract.retired ?? []).map(key));
  const removed = [];
  const reshaped = [];
  const added = [];
  for (const [k, a] of was) {
    const cur = now.get(k);
    if (!cur) removed.push(k);
    else if (cur.params !== a.params) reshaped.push(`${k}: (${a.params}) → (${cur.params})`);
  }
  for (const k of now.keys()) {
    if (!was.has(k)) added.push(retired.has(k) ? `${k} (was retired — re-adding it is fine)` : k);
  }
  return { removed, reshaped, added };
}

function writeContract(current, contract, today = new Date().toISOString().slice(0, 10)) {
  const nowKeys = new Set(current.map(key));
  const retired = [...(contract.retired ?? []).filter((r) => !nowKeys.has(key(r)))];
  for (const a of contract.actions) {
    if (!nowKeys.has(key(a)) && !retired.some((r) => key(r) === key(a))) {
      retired.push({ file: a.file, export: a.export, since: today });
    }
  }
  retired.sort((a, b) => key(a).localeCompare(key(b)));
  const next = {
    $comment:
      "Generated by `node scripts/server-actions-contract.cjs --write`. See that file and backoffice/README.md (#382) before editing.",
    actions: current,
    retired,
  };
  fs.writeFileSync(CONTRACT, JSON.stringify(next, null, 2) + "\n");
  return next;
}

module.exports = { collectActions, readContract, diffContract, writeContract, CONTRACT };

if (require.main === module) {
  const current = collectActions();
  if (process.argv.includes("--write")) {
    const before = readContract();
    const diff = diffContract(current, before);
    writeContract(current, before);
    console.log(`contract: ${current.length} actions`);
    for (const k of diff.added) console.log(`  + ${k}`);
    for (const k of diff.removed) console.log(`  - ${k}  → retired (only if it was replaced a deploy ago!)`);
    for (const k of diff.reshaped) console.log(`  ~ ${k}  (old tabs post the old shape!)`);
  } else {
    for (const a of current) console.log(`${a.file}#${a.export}(${a.params})`);
    console.log(`${current.length} actions`);
  }
}
