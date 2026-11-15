# Validation · 14 November 2026

Environment: Windows, Node.js 24.18.0, PostgreSQL 16 in the project's local Docker Compose container, Prisma 7.10.1. Synthetic data only.

| Check                                                       | Result                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Prisma client generation and strict TypeScript compilation  | Passed                                                                       |
| PostgreSQL HTTP integration suite                           | 17 passed, none skipped                                                      |
| Original-to-additive migration with existing synthetic rows | Passed in rollback-only test schema                                          |
| Clean database migration deployment                         | Both migrations applied successfully                                         |
| Compiled server and TCP demo                                | Passed; owner creates/publishes, second account denied, product tree removed |
| npm audit                                                   | 0 findings at local verification                                             |

The integration suite covers persisted registration and hash privacy, simultaneous duplicate registrations, generic sign-in failures, bearer validation, full resource CRUD, ownership/parent isolation, two cascade paths, tied-timestamp/deleted-row pagination, nested pagination, strict request schemas, invalid JSON/body size, error envelopes and authentication limiting.

Tests require `TEST_DATABASE_URL` explicitly and a loopback host. Each run uses a newly generated schema. No existing table is truncated and no existing schema is reset. The standalone/compiled demo creates new accounts in the local demo database and leaves those accounts after deleting its own synthetic product tree.

Remaining limits: no production deployment, cloud database test, reverse-proxy configuration, distributed rate limiting, load/concurrency benchmark, disaster recovery, token revocation or legacy-account authentication migration. Database row preservation does not establish compatibility for old bcrypt login data. The health endpoint is liveness-only. CI status must be checked on the published branch rather than inferred from these local results.

Fresh checkout: `npm ci`, client generation/strict compilation, all 17 database tests, the compiled-server demo and audit passed without a `.env` file, with the documented database environment variables supplied. A formatter check caught a method-chain layout that required a second formatting pass; the corrected source passes `npm run format:check`.

## Release review · 15 November 2026

The review reproduced a false positive in the original smoke harness: an unrelated API on port 3101 could satisfy its requests while the intended child failed. The harness now starts the compiled child on an OS-assigned loopback port, requires that child's IPC readiness message and fails on premature child exit. A regression holds port 3101 with a disposable compatible stub, points the compiled child at an unavailable database, and confirms nonzero exit with zero requests to the unrelated server.

After the fix, 17 PostgreSQL cases plus that smoke regression passed (18 total), as did the positive compiled-server demo on its assigned port, strict build, formatting and an audit with zero findings. No production service was exercised.
