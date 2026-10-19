import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSchema,
  compareSchemas,
  readSchema,
  renderMarkdown,
} from "../dist/index.js";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const before =
  "CREATE TABLE users (id integer PRIMARY KEY, name text, email varchar(200)); CREATE INDEX email_idx ON users (email);";
test("unit: restricted CHECK constraints reject incomplete expressions", () => {
  assert.equal(parseSchema("CREATE TABLE t (id integer CHECK (id >= 0));").tables[0].constraints[0].kind,"check");
  assert.throws(()=>parseSchema("CREATE TABLE t (id integer CHECK (id >));"), /Input rejected/);
  assert.throws(()=>parseSchema("CREATE TABLE t (id integer CHECK (call(id)));"), /Input rejected/);
});
test("unit: aliases and semicolon inside string are parsed", () => {
  const s = parseSchema(
    "-- synthetic\n CREATE TABLE t (id int primary key, enabled bool DEFAULT true, text text DEFAULT 'a; b');",
  );
  assert.equal(s.tables[0].columns[0].type, "integer");
  assert.equal(s.tables[0].columns[1].type, "boolean");
  assert.equal(s.tables[0].columns[2].defaultValue, "'a; b'");
});
test("unit: identical schema is below threshold", () => {
  assert.equal(compareSchemas(before, before).risky, false);
  assert.match(renderMarkdown(compareSchemas(before, before)), /No findings/);
});
test("unit: table and column drops, types and nullability detected", () => {
  const after =
    "CREATE TABLE users (id bigint PRIMARY KEY, name text NOT NULL);";
  const ids = compareSchemas(before, after).findings.map((f) => f.id);
  for (const id of [
    "column-dropped",
    "type-changed",
    "nullability-tightened",
    "index-dropped",
  ])
    assert.ok(ids.includes(id));
  const removed = compareSchemas(before, "CREATE TABLE other (id integer);");
  assert.ok(removed.findings.some((f) => f.id === "table-dropped"));
});
test("unit: added required column, unique constraint and index identified", () => {
  const after =
    "CREATE TABLE users (id integer PRIMARY KEY, name text, email varchar(200) UNIQUE, region text NOT NULL); CREATE UNIQUE INDEX name_idx ON users (name);";
  const r = compareSchemas(before, after);
  assert.ok(
    r.findings.some((f) => f.id === "column-added" && f.severity === "high"),
  );
  assert.ok(r.findings.some((f) => f.id === "constraint-added"));
  assert.ok(
    r.findings.some((f) => f.id === "index-added" && f.severity === "high"),
  );
});
test("integration: foreign keys and creation ordering", () => {
  const before =
    "CREATE TABLE parents (id integer PRIMARY KEY); CREATE TABLE children (id integer, parent_id integer REFERENCES parents(id));";
  const after =
    "CREATE TABLE children (id integer, parent_id integer REFERENCES parents(id)); CREATE TABLE parents (id integer PRIMARY KEY);";
  assert.equal(compareSchemas(before, before).risky, false);
  assert.ok(
    compareSchemas(before, after).findings.some(
      (f) => f.id === "creation-order-risk",
    ),
  );
});
test("unit: constraint removal and safe added column use documented severity", () => {
  const r = compareSchemas(
    "CREATE TABLE t (id integer UNIQUE);",
    "CREATE TABLE t (id integer, note text);",
  );
  assert.equal(r.risky, false);
  assert.equal(
    compareSchemas(
      "CREATE TABLE t (id integer UNIQUE);",
      "CREATE TABLE t (id integer);",
      { failOn: "medium" },
    ).risky,
    true,
  );
});
test("security: unsupported statements, expressions, unknown and duplicate fields reject", () => {
  for (const sql of [
    "DROP TABLE users;",
    "CREATE TABLE x (v mystery);",
    "CREATE TABLE x (v integer, v text);",
    "CREATE TABLE x (v integer DEFAULT malicious());",
    "CREATE TABLE x (v text); COPY x TO PROGRAM 'unsafe';",
    "CREATE TABLE x (v text); CREATE INDEX p ON x (missing);",
    'CREATE TABLE "x" (id int);',
    "/* nested /* comment */ CREATE TABLE x (id int);",
    "x".repeat(4194305),
  ])
    assert.throws(() => parseSchema(sql), /Input rejected/);
});
test("security: filesystem traversal and symlink are rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "schema-security-"));
  try {
    await writeFile(join(root, "schema.sql"), before);
    await symlink(join(root, "schema.sql"), join(root, "link.sql"));
    await assert.rejects(readSchema(root, "../secret"));
    await assert.rejects(readSchema(root, "link.sql"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("e2e: CLI CI exit codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "schema-cli-"));
  try {
    await writeFile(join(root, "before.sql"), before);
    await writeFile(
      join(root, "after.sql"),
      "CREATE TABLE other (id integer);",
    );
    const run = (a) =>
      spawnSync(
        process.execPath,
        ["dist/cli.js", ...a, "--root", root, "--json"],
        { encoding: "utf8" },
      );
    assert.equal(run(["before.sql", "before.sql"]).status, 0);
    const bad = run(["before.sql", "after.sql"]);
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).risky, true);
    assert.equal(run(["missing", "after.sql"]).status, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
