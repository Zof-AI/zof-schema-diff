import {
  fail,
  exceeds,
  severity,
  display,
  markdown,
  readBounded,
  MAX_INPUT_BYTES,
  type Finding,
  type Severity,
} from "./common.js";
export { SafeInputError, type Finding, type Severity } from "./common.js";
export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
}
export interface Constraint {
  kind: "primary" | "unique" | "foreign" | "check";
  columns: string[];
  target?: string;
  targetColumns?: string[];
  expression?: string;
  name?: string;
}
export interface Table {
  name: string;
  columns: Column[];
  constraints: Constraint[];
}
export interface Index {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}
export interface DatabaseSchema {
  tables: Table[];
  indexes: Index[];
}
export interface SchemaReport {
  findings: Finding[];
  risky: boolean;
  limitations: string[];
}
interface Token {
  kind: "word" | "number" | "string" | "punct";
  value: string;
}
const limitations = [
  "Static PostgreSQL CREATE TABLE and simple CREATE INDEX snapshots only; unsupported SQL fails explicitly.",
  "No database connection or migration execution occurs. Data size, lock duration, traffic and operational rollout safety are not verified.",
  "Column/table renames appear as drop/add. Constraint and default expression equivalence is syntactic; findings may require manual review.",
];
function tokenize(sql: string): Token[] {
  if (typeof sql !== "string" || Buffer.byteLength(sql) > MAX_INPUT_BYTES)
    fail("INPUT_SIZE");
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    if (tokens.length > 100000) fail("TOKEN_LIMIT");
    const ch = sql[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (sql.startsWith("--", i)) {
      i = sql.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0 || sql.slice(i + 2, end).includes("/*"))
        fail("COMMENT_UNSUPPORTED");
      i = end + 2;
      continue;
    }
    if (ch === "'") {
      let v = "'";
      i++;
      let closed = false;
      while (i < sql.length) {
        v += sql[i];
        if (sql[i++] === "'") {
          if (sql[i] === "'") {
            v += "'";
            i++;
          } else {
            closed = true;
            break;
          }
        }
      }
      if (!closed) fail("STRING_INVALID");
      tokens.push({ kind: "string", value: v });
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i));
    if (word) {
      tokens.push({ kind: "word", value: word[0].toLowerCase() });
      i += word[0].length;
      continue;
    }
    const num = /^-?\d+(?:\.\d+)?/.exec(sql.slice(i));
    if (num) {
      tokens.push({ kind: "number", value: num[0] });
      i += num[0].length;
      continue;
    }
    if ("(),;.=<>!+-*/".includes(ch)) {
      tokens.push({ kind: "punct", value: ch });
      i++;
      continue;
    }
    fail("SQL_TOKEN_UNSUPPORTED");
  }
  return tokens;
}
export function parseSchema(sql: string): DatabaseSchema {
  const tokens = tokenize(sql);
  let pos = 0;
  const tables: Table[] = [],
    indexes: Index[] = [];
  const peek = () => tokens[pos]?.value;
  const take = (value: string) => {
    if (peek() === value) {
      pos++;
      return true;
    }
    return false;
  };
  const need = (value: string) => {
    if (!take(value)) fail("SQL_SYNTAX_UNSUPPORTED");
  };
  const identifier = () => {
    const t = tokens[pos++];
    if (t?.kind !== "word" || t.value.length > 63)
      fail("IDENTIFIER_UNSUPPORTED");
    return t.value;
  };
  const name = () => {
    const first = identifier();
    return take(".") ? first + "." + identifier() : first;
  };
  const list = () => {
    need("(");
    const values = [identifier()];
    while (take(",")) values.push(identifier());
    need(")");
    if (new Set(values).size !== values.length) fail("DUPLICATE_COLUMN");
    return values;
  };
  const reference = (columns: string[]): Constraint => {
    const target = name(),
      targetColumns = list();
    if (columns.length !== targetColumns.length) fail("FOREIGN_KEY_INVALID");
    let expression = "";
    for (let n = 0; n < 2 && take("on"); n++) {
      const event = identifier();
      if (!["delete", "update"].includes(event))
        fail("FOREIGN_KEY_UNSUPPORTED");
      let action = identifier();
      if (["set", "no"].includes(action)) action += " " + identifier();
      if (
        ![
          "cascade",
          "restrict",
          "set null",
          "set default",
          "no action",
        ].includes(action)
      )
        fail("FOREIGN_KEY_UNSUPPORTED");
      expression += event + " " + action + ";";
    }
    return {
      kind: "foreign",
      columns,
      target,
      targetColumns,
      ...(expression ? { expression } : {}),
    };
  };
  const check = (): Constraint => {
    need("(");
    let depth = 1;
    const expr: string[] = [];
    while (pos < tokens.length && depth) {
      const t = tokens[pos++];
      if (t.value === "(") depth++;
      if (t.value === ")") depth--;
      if (depth) expr.push(t.value);
      if (depth > 16 || expr.length > 256) fail("CHECK_LIMIT");
    }
    if (
      depth ||
      !expr.length ||
      expr.some((v) =>
        ["select", "insert", "delete", "update", ";"].includes(v),
      )
    )
      fail("CHECK_UNSUPPORTED");
    const expression = expr.join(" ").replace(/([<>!]) =/g, "$1=").replace(/< >/g, "<>");
    const comparison = /^([a-z_][a-z0-9_$]*) (?:>=|<=|<>|!=|=|<|>) (?:-?\d+(?:\.\d+)?|'(?:[^']|'')*'|true|false|null)$/.exec(expression);
    const nullCheck = /^([a-z_][a-z0-9_$]*) is (?:not )?null$/.exec(expression);
    const parsed = comparison ?? nullCheck;
    if (!parsed) fail("CHECK_UNSUPPORTED");
    return { kind: "check", columns: [parsed[1]], expression };
  };
  const type = () => {
    let result = identifier();
    const allowed = [
      "smallint",
      "integer",
      "int",
      "bigint",
      "smallserial",
      "serial",
      "bigserial",
      "text",
      "boolean",
      "bool",
      "date",
      "json",
      "jsonb",
      "uuid",
      "bytea",
      "real",
      "numeric",
      "decimal",
      "varchar",
      "char",
      "character",
      "timestamp",
      "time",
      "double",
    ];
    if (!allowed.includes(result)) fail("TYPE_UNSUPPORTED");
    if (result === "double") {
      need("precision");
      result = "double precision";
    }
    if (result === "character" && take("varying")) result = "varchar";
    if (
      [
        "varchar",
        "char",
        "character",
        "numeric",
        "decimal",
        "timestamp",
        "time",
      ].includes(result) &&
      take("(")
    ) {
      const a = tokens[pos++];
      if (a?.kind !== "number" || !/^\d+$/.test(a.value))
        fail("TYPE_MODIFIER_INVALID");
      result += "(" + a.value;
      if (take(",")) {
        const b = tokens[pos++];
        if (b?.kind !== "number" || !/^\d+$/.test(b.value))
          fail("TYPE_MODIFIER_INVALID");
        result += "," + b.value;
      }
      need(")");
      result += ")";
    }
    if (
      (result.startsWith("timestamp") || result.startsWith("time")) &&
      (peek() === "with" || peek() === "without")
    ) {
      result += " " + identifier();
      need("time");
      need("zone");
      result += " time zone";
    }
    return result
      .replace(/^int$/, "integer")
      .replace(/^bool$/, "boolean")
      .replace(/^decimal/, "numeric");
  };
  while (pos < tokens.length) {
    need("create");
    const unique = take("unique");
    if (take("table")) {
      if (unique) fail("SQL_SYNTAX_UNSUPPORTED");
      const table: Table = { name: name(), columns: [], constraints: [] };
      if (tables.some((t) => t.name === table.name)) fail("DUPLICATE_TABLE");
      need("(");
      do {
        let constraintName: string | undefined;
        if (take("constraint")) constraintName = identifier();
        let con: Constraint | undefined;
        if (take("primary")) {
          need("key");
          con = { kind: "primary", columns: list() };
        } else if (take("unique")) con = { kind: "unique", columns: list() };
        else if (take("foreign")) {
          need("key");
          const columns = list();
          need("references");
          con = reference(columns);
        } else if (take("check")) con = check();
        else {
          if (constraintName) fail("CONSTRAINT_UNSUPPORTED");
          const col: Column = {
            name: identifier(),
            type: type(),
            nullable: true,
          };
          if (table.columns.some((c) => c.name === col.name))
            fail("DUPLICATE_COLUMN");
          const seen = new Set<string>();
          while (peek() !== "," && peek() !== ")") {
            const key = peek() ?? fail("SQL_INCOMPLETE");
            if (seen.has(key)) fail("COLUMN_CONSTRAINT_DUPLICATE");
            seen.add(key);
            if (take("not")) {
              need("null");
              col.nullable = false;
            } else if (take("null")) {
              col.nullable = true;
            } else if (take("default")) {
              const v = tokens[pos++];
              if (
                !v ||
                !(
                  v.kind === "string" ||
                  v.kind === "number" ||
                  [
                    "null",
                    "true",
                    "false",
                    "current_timestamp",
                    "current_date",
                  ].includes(v.value)
                )
              )
                fail("DEFAULT_UNSUPPORTED");
              col.defaultValue = v.value;
            } else if (take("primary")) {
              need("key");
              col.nullable = false;
              table.constraints.push({ kind: "primary", columns: [col.name] });
            } else if (take("unique"))
              table.constraints.push({ kind: "unique", columns: [col.name] });
            else if (take("references"))
              table.constraints.push(reference([col.name]));
            else if (take("check"))
              table.constraints.push(check());
            else fail("COLUMN_SYNTAX_UNSUPPORTED");
          }
          if (col.type.includes("serial")) {
            col.nullable = false;
            col.defaultValue = "[sequence]";
          }
          table.columns.push(col);
        }
        if (con)
          table.constraints.push({
            ...con,
            ...(constraintName ? { name: constraintName } : {}),
          });
      } while (take(","));
      need(")");
      need(";");
      if (!table.columns.length) fail("EMPTY_TABLE");
      for (const con of table.constraints)
        for (const column of con.columns) {
          const c = table.columns.find((c) => c.name === column);
          if (!c) fail("CONSTRAINT_COLUMN_UNKNOWN");
          if (con.kind === "primary") c.nullable = false;
        }
      if (table.constraints.filter((c) => c.kind === "primary").length > 1)
        fail("MULTIPLE_PRIMARY_KEYS");
      tables.push(table);
    } else if (take("index")) {
      const index: Index = { name: name(), table: "", columns: [], unique };
      if (indexes.some((i) => i.name === index.name)) fail("DUPLICATE_INDEX");
      need("on");
      index.table = name();
      index.columns = list();
      need(";");
      indexes.push(index);
    } else fail("STATEMENT_UNSUPPORTED");
  }
  if (!tables.length) fail("EMPTY_SCHEMA");
  for (const t of tables)
    for (const con of t.constraints)
      if (con.kind === "foreign") {
        const target = tables.find((t) => t.name === con.target);
        if (
          !target ||
          con.targetColumns?.some(
            (c) => !target.columns.some((x) => x.name === c),
          )
        )
          fail("FOREIGN_TARGET_UNKNOWN");
      }
  for (const index of indexes) {
    const table = tables.find((t) => t.name === index.table);
    if (
      !table ||
      index.columns.some((c) => !table.columns.some((x) => x.name === c))
    )
      fail("INDEX_TARGET_UNKNOWN");
  }
  return { tables, indexes };
}
export function compareSchemas(
  baselineSql: string,
  candidateSql: string,
  options: { failOn?: Severity } = {},
): SchemaReport {
  const baseline = parseSchema(baselineSql),
    candidate = parseSchema(candidateSql);
  const threshold = severity(options.failOn ?? "high");
  const findings: Finding[] = [];
  const add = (
    id: string,
    message: string,
    path: string,
    level: Severity = "high",
  ) => findings.push({ id, severity: level, message, path: display(path) });
  const signature = (c: Constraint) =>
    JSON.stringify({ ...c, name: undefined });
  for (const old of baseline.tables) {
    const now = candidate.tables.find((t) => t.name === old.name);
    if (!now) {
      add(
        "table-dropped",
        "Dropping a table removes stored data and its consumer contract.",
        old.name,
      );
      continue;
    }
    for (const column of old.columns) {
      const next = now.columns.find((c) => c.name === column.name),
        path = old.name + "." + column.name;
      if (!next) {
        add(
          "column-dropped",
          "Dropping a column removes data and may break readers or writers.",
          path,
        );
        continue;
      }
      if (column.type !== next.type)
        add(
          "type-changed",
          "A column type change may reject existing data, rewrite the table or change application values.",
          path,
        );
      if (column.nullable && !next.nullable)
        add(
          "nullability-tightened",
          "NOT NULL requires existing data validation and a compatible write rollout.",
          path,
        );
      if (!column.nullable && next.nullable)
        add(
          "nullability-relaxed",
          "Consumers must tolerate newly nullable values.",
          path,
          "medium",
        );
      if (column.defaultValue !== next.defaultValue)
        add(
          "default-changed",
          "The default value changed; existing and new rows may behave differently.",
          path,
          "medium",
        );
    }
    for (const column of now.columns)
      if (!old.columns.some((c) => c.name === column.name))
        add(
          "column-added",
          !column.nullable && column.defaultValue === undefined
            ? "A required column without a default needs a backfill before the constraint."
            : "An added column may require locking or application rollout coordination.",
          now.name + "." + column.name,
          !column.nullable && column.defaultValue === undefined
            ? "high"
            : "low",
        );
    for (const con of now.constraints)
      if (!old.constraints.some((c) => signature(c) === signature(con)))
        add(
          "constraint-added",
          "A new constraint may fail existing data and needs validation before enforcement.",
          now.name + "/" + con.kind,
        );
    for (const con of old.constraints)
      if (!now.constraints.some((c) => signature(c) === signature(con)))
        add(
          "constraint-removed",
          "A removed constraint weakens a previously enforced data invariant.",
          now.name + "/" + con.kind,
          "medium",
        );
  }
  for (const [order, table] of candidate.tables.entries()) {
    if (!baseline.tables.some((t) => t.name === table.name))
      add(
        "table-added",
        "A table was added; validate application deployment order.",
        table.name,
        "info",
      );
    for (const con of table.constraints)
      if (
        con.kind === "foreign" &&
        con.target !== table.name &&
        candidate.tables.findIndex((t) => t.name === con.target) > order
      )
        add(
          "creation-order-risk",
          "A referenced table is declared later; create it before the foreign key.",
          table.name + "/" + con.kind,
        );
  }
  for (const old of baseline.indexes) {
    const now = candidate.indexes.find((i) => i.name === old.name);
    if (!now)
      add(
        "index-dropped",
        "Dropping an index may slow queries or remove uniqueness.",
        old.name,
        old.unique ? "high" : "medium",
      );
    else if (JSON.stringify(old) !== JSON.stringify(now))
      add(
        "index-changed",
        "An index definition changed and needs a rebuild and locking review.",
        old.name,
        now.unique ? "high" : "medium",
      );
  }
  for (const index of candidate.indexes)
    if (!baseline.indexes.some((i) => i.name === index.name))
      add(
        "index-added",
        index.unique
          ? "A new unique index requires duplicate validation and a build plan."
          : "A new index needs a build and lock strategy for populated tables.",
        index.name,
        index.unique ? "high" : "medium",
      );
  return {
    findings,
    risky: exceeds(findings, threshold),
    limitations: [...limitations],
  };
}
export const readSchema = (root: string, path: string): Promise<string> =>
  readBounded(root, path);
export const renderMarkdown = (report: SchemaReport): string =>
  markdown(
    "PostgreSQL schema risk report",
    report.findings,
    report.limitations,
  );
