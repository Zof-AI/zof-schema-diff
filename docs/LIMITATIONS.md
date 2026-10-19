# Limits and interpretation

This is a static snapshot comparator, not a PostgreSQL server parser, query planner or migration runner. It rejects unsupported statements and syntax. ALTER/DROP scripts, views, triggers, functions, extensions, generated columns, arrays, domains, enum definitions, quoted identifiers, partitioning, identity clauses, expression/partial indexes and concurrent index statements are outside the supported grammar. Convert a reviewed schema to supported CREATE snapshots before comparison; never silently discard unsupported SQL.

A maximum 4 MiB per SQL file and 100,000 tokens prevents unbounded parsing. CHECK expressions are limited, not evaluated, and compared syntactically. PostgreSQL may reject a snapshot for semantic reasons this tool cannot infer. Default/type compatibility, uniqueness of referenced columns and data-dependent constraints require database validation.

Renames appear as drops/additions. Equivalent expressions can produce false positives. Static finding severity is advisory: production risk also depends on data volume, lock duration, traffic, indexes, configuration and rollout order. A low-severity addition still needs an operational plan. The CLI never requests credentials or opens a database connection.

Synthetic acceptance tests use only an explicitly created isolated local PostgreSQL container, never a production database. Hosted integration and production verification are not implemented. Public installation, legal approval and independent release review remain gates.
