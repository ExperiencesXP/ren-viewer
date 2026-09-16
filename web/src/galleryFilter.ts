/** Logic-gate filter language for the gallery sieve. */

export type Field = "name" | "ext" | "path";
export type Gate = "and" | "or" | "xor" | "nand" | "nor" | "xnor" | "not";

export type CaseSpan = { text: string; sensitive: boolean };

export type TermNode = {
  type: "term";
  field: Field;
  raw: string;
  spans: CaseSpan[];
};

export type NotNode = { type: "not"; inner: Ast };
export type BinNode = {
  type: "bin";
  op: Exclude<Gate, "not">;
  left: Ast;
  right: Ast;
};
export type Ast = TermNode | NotNode | BinNode;

export type FilterQuery = {
  ast: Ast | null;
  description: string;
  empty: boolean;
  gates: Set<Gate>;
};

export type PlateLike = { name: string; file: string | null };

const GATE_WORDS = ["nand", "xnor", "xor", "nor", "and", "or", "not"] as const;
const FIELD_ALIASES: Record<string, Field> = {
  kind: "ext",
  type: "ext",
  ext: "ext",
  extension: "ext",
  file: "ext",
  path: "path",
  name: "name",
};

type Token =
  | { kind: "term"; raw: string; spans: CaseSpan[]; field?: Field }
  | { kind: "op"; op: Gate }
  | { kind: "field"; field: Field }
  | { kind: "comma" }
  | { kind: "lparen" }
  | { kind: "rparen" };

const GATE_ALT = GATE_WORDS.join("|");
const ESCAPED_GATE = new RegExp(`^(${GATE_ALT})\\??`, "i");
const FIELD_RE = /^(kind|type|ext|extension|file|path|name):/i;
const OP_RE = new RegExp(`^(${GATE_ALT})\\b`, "i");
const BARE_EXT = /^\.[A-Za-z0-9]+$/;

export function parseSpans(raw: string): CaseSpan[] {
  const spans: CaseSpan[] = [];
  let buf = "";
  let sensitive = false;
  for (const ch of raw) {
    if (ch === "!") {
      if (buf) spans.push({ text: buf, sensitive });
      buf = "";
      sensitive = !sensitive;
      continue;
    }
    buf += ch;
  }
  if (buf) spans.push({ text: buf, sensitive });
  return spans.length ? spans : [{ text: "", sensitive: false }];
}

export function displayTerm(spans: CaseSpan[]): string {
  return spans.map((s) => s.text).join("");
}

function lex(src: string): Token[] {
  const tokens: Token[] = [];
  const n = src.length;
  let i = 0;

  const skipSpace = () => {
    while (i < n && /\s/.test(src[i] as string)) i++;
  };

  while (i < n) {
    skipSpace();
    if (i >= n) break;
    const c = src[i] as string;
    if (c === ",") {
      tokens.push({ kind: "comma" });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (c === "?") {
      const m = src.slice(i + 1).match(ESCAPED_GATE);
      if (m) {
        const word = m[1] as string;
        tokens.push({ kind: "term", raw: word, spans: parseSpans(word) });
        i += 1 + m[0].length;
        continue;
      }
    }
    const fieldM = src.slice(i).match(FIELD_RE);
    if (fieldM) {
      const key = (fieldM[1] as string).toLowerCase();
      tokens.push({ kind: "field", field: FIELD_ALIASES[key] as Field });
      i += fieldM[0].length;
      continue;
    }
    const opM = src.slice(i).match(OP_RE);
    if (opM) {
      tokens.push({ kind: "op", op: (opM[1] as string).toLowerCase() as Gate });
      i += opM[0].length;
      continue;
    }
    let j = i;
    while (j < n && !/[\s,()]/.test(src[j] as string)) j++;
    const raw = src.slice(i, j);
    if (raw) tokens.push({ kind: "term", raw, spans: parseSpans(raw) });
    i = j;
  }
  return tokens;
}

function mergePhrases(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    if (t.kind === "term" && prev && prev.kind === "term") {
      out[out.length - 1] = {
        kind: "term",
        raw: `${prev.raw} ${t.raw}`,
        spans: [...prev.spans, { text: " ", sensitive: false }, ...t.spans],
      };
    } else {
      out.push(t);
    }
  }
  return out;
}

function applyFields(tokens: Token[]): Token[] {
  let field: Field = "name";
  const out: Token[] = [];
  for (const t of tokens) {
    if (t.kind === "field") {
      field = t.field;
      continue;
    }
    if (t.kind === "comma") {
      field = "name";
      out.push(t);
      continue;
    }
    if (t.kind === "term") {
      const stripped = t.raw.replace(/!/g, "");
      const resolved: Field = field === "name" && BARE_EXT.test(stripped) ? "ext" : field;
      out.push({ ...t, field: resolved });
    } else {
      out.push(t);
    }
  }
  return out;
}

type Parser = { tokens: Token[]; i: number };

function peek(p: Parser): Token | undefined {
  return p.tokens[p.i];
}

function parsePrimary(p: Parser): Ast | null {
  const t = peek(p);
  if (!t) return null;
  if (t.kind === "lparen") {
    p.i++;
    const inner = parseClauses(p);
    if (peek(p)?.kind === "rparen") p.i++;
    return inner;
  }
  if (t.kind === "term") {
    p.i++;
    return { type: "term", field: t.field ?? "name", raw: t.raw, spans: t.spans };
  }
  return null;
}

function parseNot(p: Parser): Ast | null {
  const t = peek(p);
  if (t?.kind === "op" && t.op === "not") {
    p.i++;
    const inner = parseNot(p) ?? parsePrimary(p);
    if (!inner) return null;
    return { type: "not", inner };
  }
  return parsePrimary(p);
}

function parseBin(
  p: Parser,
  ops: Exclude<Gate, "not">[],
  down: (p: Parser) => Ast | null,
): Ast | null {
  let left = down(p);
  if (!left) return null;
  while (true) {
    const t = peek(p);
    if (t?.kind !== "op" || !ops.includes(t.op as Exclude<Gate, "not">)) break;
    const op = t.op as Exclude<Gate, "not">;
    p.i++;
    const right = down(p);
    if (!right) return null;
    left = { type: "bin", op, left, right };
  }
  return left;
}

function parseAnd(p: Parser): Ast | null {
  return parseBin(p, ["and", "nand"], parseNot);
}

function parseXor(p: Parser): Ast | null {
  return parseBin(p, ["xor", "xnor"], parseAnd);
}

function parseOr(p: Parser): Ast | null {
  return parseBin(p, ["or", "nor"], parseXor);
}

function parseClauses(p: Parser): Ast | null {
  let left = parseOr(p);
  while (peek(p)?.kind === "comma") {
    p.i++;
    while (peek(p)?.kind === "comma") p.i++;
    const right = parseOr(p);
    if (!left) {
      left = right;
      continue;
    }
    if (!right) continue;
    left = { type: "bin", op: "and", left, right };
  }
  return left;
}

function collectGates(ast: Ast | null, into: Set<Gate>): void {
  if (!ast) return;
  if (ast.type === "not") {
    into.add("not");
    collectGates(ast.inner, into);
    return;
  }
  if (ast.type === "bin") {
    into.add(ast.op);
    collectGates(ast.left, into);
    collectGates(ast.right, into);
  }
}

export function parseFilter(raw: string): FilterQuery {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ast: null, description: "", empty: true, gates: new Set() };
  }
  const tokens = applyFields(mergePhrases(lex(trimmed)));
  const ast = parseClauses({ tokens, i: 0 });
  const gates = new Set<Gate>();
  collectGates(ast, gates);
  return {
    ast,
    description: ast ? describe(ast) : "",
    empty: false,
    gates,
  };
}

function fieldsUsed(ast: Ast, into: Set<Field> = new Set()): Set<Field> {
  if (ast.type === "term") {
    into.add(ast.field);
  } else if (ast.type === "not") {
    fieldsUsed(ast.inner, into);
  } else {
    fieldsUsed(ast.left, into);
    fieldsUsed(ast.right, into);
  }
  return into;
}

function flattenAnd(ast: Ast): Ast[] {
  if (ast.type === "bin" && ast.op === "and") {
    return [...flattenAnd(ast.left), ...flattenAnd(ast.right)];
  }
  return [ast];
}

function isPure(ast: Ast, field: Field): boolean {
  const used = fieldsUsed(ast);
  return used.size === 1 && used.has(field);
}

function describeTerm(node: TermNode): string {
  const text = displayTerm(node.spans);
  if (node.field === "ext") return text;
  return `'${text}'`;
}

function describeExpr(ast: Ast): string {
  if (ast.type === "term") return describeTerm(ast);
  if (ast.type === "not") return `not ${describeExpr(ast.inner)}`;
  const l = describeExpr(ast.left);
  const r = describeExpr(ast.right);
  switch (ast.op) {
    case "and":
      return `${l} and ${r}`;
    case "or":
      return `${l} or ${r}`;
    case "xor":
      return `either ${l} or ${r}, but not both`;
    case "nand":
      return `not both ${l} and ${r}`;
    case "nor":
      return `neither ${l} nor ${r}`;
    case "xnor":
      return `both ${l} and ${r}, or neither`;
  }
}

function joinAnd(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] as string;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function describe(ast: Ast): string {
  const parts = flattenAnd(ast);
  const names = parts.filter((p) => isPure(p, "name"));
  const exts = parts.filter((p) => isPure(p, "ext"));
  const paths = parts.filter((p) => isPure(p, "path"));
  const rest = parts.filter((p) => !isPure(p, "name") && !isPure(p, "ext") && !isPure(p, "path"));

  if (rest.length === 0 && (names.length || exts.length || paths.length)) {
    const bits: string[] = [];
    if (names.length) bits.push(`file names including ${joinAnd(names.map(describeExpr))}`);
    if (exts.length) bits.push(`having the file extension ${joinAnd(exts.map(describeExpr))}`);
    if (paths.length) bits.push(`in a path containing ${joinAnd(paths.map(describeExpr))}`);
    const head = bits[0] as string;
    if (bits.length === 1) return `Filtering for ${head}`;
    return `Filtering for ${head}${bits.slice(1).map((b) => `, while also ${b}`).join("")}`;
  }
  return `Filtering for ${describeExpr(ast)}`;
}

export function includesSpans(haystack: string, spans: CaseSpan[]): boolean {
  const parts = spans.filter((s) => s.text.length > 0);
  if (parts.length === 0) return true;
  const needleLen = parts.reduce((n, s) => n + s.text.length, 0);
  if (needleLen > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needleLen; i++) {
    let at = i;
    for (const span of parts) {
      const slice = haystack.slice(at, at + span.text.length);
      if (span.sensitive) {
        if (slice !== span.text) continue outer;
      } else if (slice.toLowerCase() !== span.text.toLowerCase()) {
        continue outer;
      }
      at += span.text.length;
    }
    return true;
  }
  return false;
}

function extOf(file: string): string {
  const base = file.replace(/\\/g, "/");
  const slash = base.lastIndexOf("/");
  const name = slash >= 0 ? base.slice(slash + 1) : base;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1);
}

function stripExtDot(spans: CaseSpan[]): CaseSpan[] {
  if (!spans.length) return spans;
  const first = spans[0] as CaseSpan;
  if (!first.text.startsWith(".")) return spans;
  const next = { ...first, text: first.text.slice(1) };
  if (!next.text && spans.length === 1) return [{ text: "", sensitive: false }];
  if (!next.text) return spans.slice(1);
  return [next, ...spans.slice(1)];
}

function evalAst(ast: Ast, item: PlateLike): boolean {
  if (ast.type === "not") return !evalAst(ast.inner, item);
  if (ast.type === "bin") {
    const a = evalAst(ast.left, item);
    const b = evalAst(ast.right, item);
    switch (ast.op) {
      case "and":
        return a && b;
      case "or":
        return a || b;
      case "xor":
        return a !== b;
      case "nand":
        return !(a && b);
      case "nor":
        return !(a || b);
      case "xnor":
        return a === b;
    }
  }
  const file = item.file ?? "";
  if (ast.field === "ext") {
    return includesSpans(extOf(file), stripExtDot(ast.spans));
  }
  if (ast.field === "path") {
    const hay = file.replace(/\\/g, "/");
    const spans = ast.spans.map((s) => ({ ...s, text: s.text.replace(/\\/g, "/") }));
    return includesSpans(hay, spans);
  }
  const base = file.replace(/\\/g, "/").split("/").pop() ?? file;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return (
    includesSpans(item.name, ast.spans) ||
    includesSpans(base, ast.spans) ||
    includesSpans(stem, ast.spans)
  );
}

export function matchPlate(query: FilterQuery, item: PlateLike): boolean {
  if (query.empty) return true;
  if (!query.ast) return false;
  return evalAst(query.ast, item);
}

export const TRUTH_ROWS: {
  gate: Gate;
  label: string;
  hint: string;
  cells: [string, string, string, string] | [string, string];
}[] = [
  { gate: "and", label: "AND", hint: "a and b", cells: ["0", "0", "0", "1"] },
  { gate: "or", label: "OR", hint: "a or b", cells: ["0", "1", "1", "1"] },
  { gate: "xor", label: "XOR", hint: "a xor b", cells: ["0", "1", "1", "0"] },
  { gate: "nand", label: "NAND", hint: "a nand b", cells: ["1", "1", "1", "0"] },
  { gate: "nor", label: "NOR", hint: "a nor b", cells: ["1", "0", "0", "0"] },
  { gate: "xnor", label: "XNOR", hint: "a xnor b", cells: ["1", "0", "0", "1"] },
  { gate: "not", label: "NOT", hint: "not a", cells: ["1", "0"] },
];
