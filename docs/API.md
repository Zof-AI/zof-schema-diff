# API and supported SQL

`parseSchema(sql)` returns `{tables, indexes}`. Tables contain `name`, `columns`, and `constraints`; columns contain `name`, canonical `type`, `nullable`, and optional `defaultValue`. Constraint kinds are primary, unique, foreign and check. Indexes contain `name`, `table`, `columns`, `unique`.

`compareSchemas(baselineSql, candidateSql, {failOn?})` returns `{findings, risky, limitations}`. Default threshold is high. Finding severities use info/low/medium/high/critical. `readSchema(root, relativePath)` is a bounded UTF-8 file read. `renderMarkdown(report)` renders the findings. `SafeInputError` carries fixed safe messages and codes.

Supported statements require semicolons: `CREATE TABLE name (...)` and `CREATE [UNIQUE] INDEX name ON table (columns)`. Identifiers are unquoted PostgreSQL-style names, optionally schema qualified for tables/indexes. Inline and table-level primary/unique/foreign keys, named table constraints, single-column literal-comparison or IS NULL CHECK expressions, literal defaults, CURRENT_DATE, CURRENT_TIMESTAMP and serial-family columns are recognized. Foreign keys require explicit target columns and may use ON DELETE/UPDATE actions. Referenced tables and columns must exist in the snapshot.

Types: smallint/integer/int/bigint, smallserial/serial/bigserial, text, boolean/bool, date, json/jsonb, uuid, bytea, real, numeric/decimal, varchar/char/character varying, timestamp/time (with or without time zone), double precision. Supported length/precision modifiers are preserved syntactically; PostgreSQL semantic validity is not fully evaluated.

Finding IDs: table-dropped, column-dropped, type-changed, nullability-tightened, nullability-relaxed, default-changed, column-added, constraint-added, constraint-removed, table-added, creation-order-risk, index-dropped, index-changed, index-added. Drops and changed types, new required columns without defaults, tightened constraints and unique-index changes default to high. Removed constraints, changed defaults and ordinary index changes use medium; nullable/defaulted new columns use low.
