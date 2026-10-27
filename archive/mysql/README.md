# Retained MySQL baseline

The complete instrumented old stack is preserved by commit `91e707f376372aed5bdf415dd7bbb32d58583536`. Use a separate checkout of that commit to reproduce the MySQL/Groq/Azure baseline; do not combine its generated client with the PostgreSQL schema.

`migrations/` preserves all historical MySQL SQL and its original migration lock outside Prisma's active migration path. `phase1/` contains reference copies of adapter/server/schema/configuration, package manifest, and database test/tool sources as `.source.txt`; these are not executable imports or active migrations. No environment or generated files are archived.

The active branch is PostgreSQL preparation only. No Supabase project, migration execution, data transfer, or runtime cutover is performed. Existing private MySQL environment configuration is untouched and will be rejected by the new PostgreSQL runtime. The MariaDB adapter/dependency remains temporarily to preserve the legacy requirement; its final retirement requires successful real PostgreSQL replacement verification. Historical quiz collation compatibility is unverified.
