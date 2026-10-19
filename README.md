# Zof Schema Diff

Analyze PostgreSQL schema snapshots for data-loss and migration rollout concerns. The offline parser compares supported `CREATE TABLE` and simple `CREATE INDEX` definitions, then reports table/column drops, type/default changes, nullability, constraints, indexes and foreign-key creation order.

<!-- ZOF_RELEASE_INSTALL_START -->
## Install from GitHub source

Requires Node.js 22 or 24, npm, and Git. Filesystem operations require Linux or macOS with Python 3.10 or newer; Windows file operations fail closed. Clone this repository and explicitly prepare its reviewed release dependencies:

```sh
git clone https://github.com/Zof-AI/zof-schema-diff.git
cd zof-schema-diff
node scripts/bootstrap.mjs --allow-network
npm ci --ignore-scripts --prefer-offline
npm run build
npm test
```

The bootstrap downloads only the exact `v0.1.0` dependency assets from [GitHub Releases](https://github.com/Zof-AI/zof-schema-diff/releases), as listed in `scripts/release-dependencies.json`, verifies SHA256 and byte size, and adds them to the npm cache. It does not extract archives, run package scripts, collect application data, or send credentials. Downloads require the explicit flag and follow only HTTPS GitHub asset redirects. Installation then fetches ordinary third-party dependencies from npm. Use a writable npm cache; set `npm_config_cache` consistently for both commands if needed. An unavailable asset, changed hash, or oversized response stops installation.

GitHub source and release artifacts are the initial distribution channel. These instructions do not claim that `@zofai` packages are published on npm or that the VS Code extension is listed in Marketplace.
<!-- ZOF_RELEASE_INSTALL_END -->

## Local installation

Use Node.js 22 or 24:

```sh
npm ci --ignore-scripts
npm run build
npm test
npm pack --ignore-scripts
```

Use the GitHub source installation above to obtain the exact release dependencies before building or importing the library. The npm package name is an identifier; registry publication remains separate.

## Three examples

```sh
# Optional new column, low severity: exit 0 at default high threshold
node dist/cli.js examples/baseline.sql examples/compatible.sql --json
# Dropped column, type change and NOT NULL: exit 1
node dist/cli.js examples/baseline.sql examples/breaking.sql --markdown
# New uniqueness constraints and index rebuild: exit 1
node dist/cli.js examples/baseline.sql examples/constraints.sql --json
```

Set `--root DIR` to constrain file reads, or `--fail-on medium` to fail CI on operational index risks. Exit 0 means supported static checks completed below threshold; 1 means findings met the threshold; 2 means unsupported, invalid or unreadable input. Reports never certify production migration safety.

## Library

```js
import { compareSchemas, parseSchema, readSchema } from '@zofai/schema-diff';
const before = await readSchema(process.cwd(), 'before.sql');
const after = await readSchema(process.cwd(), 'after.sql');
const report = compareSchemas(before, after, { failOn: 'high' });
console.log(report.findings);
```

No database connection or migration execution occurs. See [API and SQL grammar](docs/API.md), [limitations](docs/LIMITATIONS.md), [synthetic PostgreSQL acceptance](docs/POSTGRES_ACCEPTANCE.md) and [release gates](docs/RELEASE.md).
