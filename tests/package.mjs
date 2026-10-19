import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const repo = process.cwd();
const temp = await mkdtemp(join(tmpdir(), "zof-package-"));
const run = (command, args, cwd = temp) => {
  const r = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      npm_config_cache: process.env.npm_config_cache ?? join(temp, "cache"),
    },
  });
  assert.equal(r.status, 0, "Packaged command failed");
  return r.stdout;
};
try {
  const packed = JSON.parse(
    run(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temp],
      repo,
    ),
  )[0];
  assert.ok(packed.files.length > 5);
  for (const entry of packed.files) {
    assert.ok(!entry.path.includes("node_modules"));
    assert.ok(!entry.path.includes("orchestration"));
    assert.ok(!entry.path.endsWith(".log"));
  }
  await writeFile(
    join(temp, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  const candidates = [];
  const evidence = resolve("../../orchestration/artifacts/zof-ai-evidence-spec-0.1.1.tgz");
  try { await access(evidence); candidates.push(evidence); } catch {}
  run(process.platform === "win32" ? "npm.cmd" : "npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    ...candidates,
    join(temp, packed.filename),
  ]);
  const cli = join(temp, "node_modules", "@zof-ai/schema-diff", "dist/cli.js");
  assert.match(run(process.execPath, [cli, "--version"]), /0\.1\.1/);
  assert.match(run(process.execPath, [cli, "--help"]), /Static/);
  run(process.execPath, [
    "--input-type=module",
    "-e",
    "import assert from 'node:assert/strict'; import { compareSchemas } from '@zof-ai/schema-diff'; assert.equal(compareSchemas('CREATE TABLE t (id int);','CREATE TABLE t (id text);').risky,true);",
  ]);
  const metadata = JSON.parse(
    await readFile(
      join(temp, "node_modules", "@zof-ai/schema-diff", "package.json"),
      "utf8",
    ),
  );
  assert.ok(!JSON.stringify(metadata).includes("file:"));
  console.log(
    JSON.stringify({
      status: "passed",
      checks: 5,
      files: packed.files.length,
      package: "@zof-ai/schema-diff",
    }),
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
