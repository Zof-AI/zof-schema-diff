# Zof Schema Diff

Analyze PostgreSQL schema snapshots for data-loss and migration rollout concerns. The offline parser compares supported `CREATE TABLE` and simple `CREATE INDEX` definitions, then reports table/column drops, type/default changes, nullability, constraints, indexes and foreign-key creation order.

<!-- ZOF_NPM_INSTALL_START -->
## Install from npm

Use Node.js 22 or 24 and npm. File-based operations require Linux or macOS with Python 3.10 or newer; Windows file operations fail closed. In a new project directory, install the version used by this guide:

```sh
npm install --ignore-scripts --save-exact @zof-ai/schema-diff@0.1.1
npx --no-install zof-schema-diff --help
```

The package includes compiled JavaScript, TypeScript declarations and its runtime dependencies. No source build, Zof account or repository upload is required. `--ignore-scripts` disables installation lifecycle scripts; `--no-install` keeps the example commands from downloading another package.

Confirm the public ESM entry point; this prints `function`:

```sh
node --input-type=module -e "import('@zof-ai/schema-diff').then(api => console.log(typeof api.compareSchemas))"
```

Run a packaged example from the same directory:

```sh
npx --no-install zof-schema-diff baseline.sql compatible.sql --root node_modules/@zof-ai/schema-diff/examples --json
```

The compatible PostgreSQL example reports no high-severity breaking change.

Package: [@zof-ai/schema-diff](https://www.npmjs.com/package/@zof-ai/schema-diff). The source-checkout instructions and three additional workflows follow.
<!-- ZOF_NPM_INSTALL_END -->

<!-- ZOF_RELEASE_INSTALL_START -->
## Install from GitHub source

Requires Node.js 22 or 24, npm, and Git. Filesystem operations require Linux or macOS with Python 3.10 or newer; Windows file operations fail closed. Clone this repository and explicitly prepare its reviewed release dependencies:

```sh
git clone --branch v0.1.1 --depth 1 https://github.com/Zof-AI/zof-schema-diff.git
cd zof-schema-diff
node scripts/bootstrap.mjs --allow-network
npm ci --ignore-scripts --prefer-offline
npm run build
npm test
```

The bootstrap downloads only the exact versioned dependency assets from [GitHub Releases](https://github.com/Zof-AI/zof-schema-diff/releases), as listed in `scripts/release-dependencies.json`, verifies SHA256 and byte size, and adds them to the npm cache. It does not extract archives, run package scripts, collect application data, or send credentials. Downloads require the explicit flag and follow only HTTPS GitHub asset redirects. Installation then fetches ordinary third-party dependencies from npm. Use a writable npm cache; set `npm_config_cache` consistently for both commands if needed. An unavailable asset, changed hash, or oversized response stops installation.

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
import { compareSchemas, parseSchema, readSchema } from '@zof-ai/schema-diff';
const before = await readSchema(process.cwd(), 'before.sql');
const after = await readSchema(process.cwd(), 'after.sql');
const report = compareSchemas(before, after, { failOn: 'high' });
console.log(report.findings);
```

No database connection or migration execution occurs. See [API and SQL grammar](docs/API.md), [limitations](docs/LIMITATIONS.md), [synthetic PostgreSQL acceptance](docs/POSTGRES_ACCEPTANCE.md) and [release gates](docs/RELEASE.md).
