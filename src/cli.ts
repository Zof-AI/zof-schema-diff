#!/usr/bin/env node
import { compareSchemas, readSchema, renderMarkdown } from "./index.js";
import { cliError, fail, severity, type Severity } from "./common.js";
try {
  const args = process.argv.slice(2);
  if (args.includes("--help"))
    console.log(
      "zof-schema-diff BASELINE.sql CANDIDATE.sql [--root DIR] [--json|--markdown] [--fail-on SEVERITY]\nStatic offline snapshots. Exit 0: below threshold; 1: findings; 2: invalid/unsupported input.",
    );
  else if (args.includes("--version")) console.log("0.1.0");
  else {
    let root = process.cwd(),
      json = false,
      failOn: Severity = "high";
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--root") root = args[++i] ?? fail("ARGUMENT_REQUIRED");
      else if (args[i] === "--json") json = true;
      else if (args[i] === "--markdown") json = false;
      else if (args[i] === "--fail-on") failOn = severity(args[++i]);
      else if (args[i].startsWith("-")) fail("ARGUMENT_UNKNOWN");
      else files.push(args[i]);
    }
    if (files.length !== 2) fail("TWO_FILES_REQUIRED");
    const report = compareSchemas(
      await readSchema(root, files[0]),
      await readSchema(root, files[1]),
      { failOn },
    );
    console.log(
      json ? JSON.stringify(report, null, 2) : renderMarkdown(report),
    );
    process.exitCode = report.risky ? 1 : 0;
  }
} catch (error) {
  cliError(error);
}
