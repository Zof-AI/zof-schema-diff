import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { compareSchemas } from "../dist/index.js";
const name = "zof-schema-acceptance-" + randomUUID();
const run = (args, input) => {
  const r = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  if (r.error) throw new Error("Docker operation unavailable");
  return r;
};
assert.equal(
  run(["image", "inspect", "postgres:17-alpine"]).status,
  0,
  "Explicitly install the postgres:17-alpine image before acceptance",
);
let created = false;
try {
  const start = run([
    "run",
    "-d",
    "--name",
    name,
    "--network",
    "none",
    "--memory",
    "256m",
    "--cpus",
    "1",
    "--pids-limit",
    "128",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/var/lib/postgresql/data:rw,nosuid,nodev,size=128m,uid=70,gid=70",
    "--tmpfs",
    "/var/run/postgresql:rw,nosuid,nodev,size=16m,uid=70,gid=70",
    "--user",
    "postgres",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=synthetic",
    "postgres:17-alpine",
  ]);
  assert.equal(start.status, 0, "Disposable PostgreSQL startup failed");
  created = true;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (
      run(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "synthetic"])
        .status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Database did not become ready");
  const sql = (text) =>
    run(
      [
        "exec",
        "-i",
        name,
        "psql",
        "-U",
        "postgres",
        "-d",
        "synthetic",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      text,
    );
  assert.equal(
    sql(
      "CREATE TABLE accounts (id integer PRIMARY KEY, label text); INSERT INTO accounts VALUES (1,NULL);",
    ).status,
    0,
  );
  assert.notEqual(
    sql("ALTER TABLE accounts ALTER COLUMN label SET NOT NULL;").status,
    0,
  );
  assert.ok(
    compareSchemas(
      "CREATE TABLE accounts (id integer PRIMARY KEY, label text);",
      "CREATE TABLE accounts (id integer PRIMARY KEY, label text NOT NULL);",
    ).findings.some((f) => f.id === "nullability-tightened"),
  );
  assert.equal(sql("ALTER TABLE accounts ADD COLUMN note text;").status, 0);
  assert.equal(
    compareSchemas(
      "CREATE TABLE accounts (id integer PRIMARY KEY, label text);",
      "CREATE TABLE accounts (id integer PRIMARY KEY, label text, note text);",
    ).risky,
    false,
  );
  console.log(
    JSON.stringify({
      status: "passed",
      checks: 4,
      syntheticOnly: true,
      network: "none",
    }),
  );
} finally {
  if (created)
    assert.equal(run(["rm", "-f", name]).status, 0, "Container cleanup failed");
}
