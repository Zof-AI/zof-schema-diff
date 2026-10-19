# Zof Schema Diff

Analyze PostgreSQL schema snapshots for data-loss and migration rollout concerns. The offline parser compares supported `CREATE TABLE` and simple `CREATE INDEX` definitions, then reports table/column drops, type/default changes, nullability, constraints, indexes and foreign-key creation order.

## Local installation

Use Node.js 22 or 24:

```sh
npm ci --ignore-scripts
npm run build
npm test
npm pack --ignore-scripts
```

Install the resulting tarball in a separate project with `npm install /absolute/path/to/package.tgz`. The candidate package is `@zof-ai/schema-diff`; public installation and intended repository URLs remain unverified. Proposed Apache-2.0 licensing requires legal and owner approval.

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
