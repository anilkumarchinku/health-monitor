# Isolated PostgreSQL migration checks

Run from the project root without adding app dependencies:

```sh
npm install --prefix /tmp/health-monitor-sql-check --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.8
PGLITE_MODULE=/tmp/health-monitor-sql-check/node_modules/@electric-sql/pglite node tests/sql/verify-migrations.cjs
```

This starts an in-memory embedded PostgreSQL, creates Supabase-like roles and an `auth.users`/`auth.uid()` stub, applies base SQL then ordered migrations, and exercises grants, ownership, constraints, rate limits, and queue claims. It never connects to a hosted database. `CREATE EXTENSION pgcrypto` is omitted because UUID generation is built in; hosted extension setup, Auth, Storage, network requests and multi-connection concurrency are not verified here. Run staging checks before deployment.
