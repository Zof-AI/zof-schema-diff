# Synthetic PostgreSQL acceptance

`node tests/postgres.mjs` starts one uniquely named disposable PostgreSQL container from an already available `postgres:17-alpine` image. It has no network, published ports or host mounts, uses a fixed synthetic database name and local trust authentication inside the isolated container, and has CPU/memory/PID limits. It is removed in a finally block. Image acquisition is an explicit operator action; the script never pulls images.

The test creates a table with a nullable row, confirms that tightening NOT NULL fails on the synthetic data, and confirms the corresponding static finding. It also confirms that a harmless optional column is accepted and below the default static threshold. It is not automatically run by normal tests, since Docker and an image are optional. Missing prerequisites are failures, never passes.

Run only in a development environment authorized for disposable local containers. No production data or credentials are accepted.
