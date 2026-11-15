# Product release API

[Build and PostgreSQL integration checks on the review branch](https://github.com/zumarzehgeer/api-design-v4/actions?query=branch%3Aportfolio%2Fbackend-showcase)

A Node.js/TypeScript API for managing products, release updates and release notes. Register two synthetic accounts, create and publish a release, then verify that the second account cannot read or change it. PostgreSQL integration tests exercise the actual routes and migrations.

**Course foundation:** this repository started from [Scott Moss's API Design with Node.js v4](https://hendrixer.github.io/API-design-v4/) material. The original commit and migration remain in history. The portfolio extension implements the previously empty resource routes, finishes authentication, adds strict validation and ownership checks, keyset pagination, migration coverage, a compiled-server demo and CI. This is a personal learning project, with no production usage or performance claims.

## Evaluate locally

Requires Node.js 24 and Docker Desktop/Engine running Linux containers, or an existing local PostgreSQL 16 database.

```sh
npm ci
docker compose up -d --wait
```

Copy `.env.example` to `.env` (`cp .env.example .env` in Bash, `Copy-Item .env.example .env` in PowerShell). Replace `JWT_SECRET` with the output of:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run db:migrate
npm run build
npm start
```

In a second terminal, run `npm run demo`. It creates two synthetic accounts, persists a product/release/note, checks cross-account rejection, publishes the release and removes its synthetic product tree. It prints no tokens or passwords. Two demo accounts remain in your local database. The demo accepts only a loopback `API_URL`; it does not contact a third-party service.

The server defaults to `http://127.0.0.1:3001`. `npm run dev` watches TypeScript sources during development. `GET /health` is a liveness endpoint, not an ongoing database readiness check. There is no hosted public API.

## Run the checks

Set `TEST_DATABASE_URL` in the terminal. Tests require a loopback host and create a unique schema, apply the real migrations and remove only their own schema afterward. They never truncate existing tables or reset your database. Use a disposable local database account with permission to create schemas.

```powershell
$env:TEST_DATABASE_URL='postgresql://release_demo:local_demo_only@127.0.0.1:55432/release_demo'
npm test
```

```sh
TEST_DATABASE_URL='postgresql://release_demo:local_demo_only@127.0.0.1:55432/release_demo' npm test
```

`npm run test:smoke` starts the compiled server on an available loopback port, waits for that child's readiness message, runs the same demo and stops the server. Run `npm run db:migrate` and `npm run build` first. It uses `DATABASE_URL` from your environment or `.env`, so target the local demo database. Like the standalone demo, it leaves two synthetic accounts.

CI runs a clean install, TypeScript/client generation, 17 PostgreSQL integration cases, migrations, the compiled-server demo and an audit that fails on high/critical advisories. See [validation](docs/VALIDATION.md) for the checks actually performed.

## API and decisions

- [API reference](docs/API.md): authentication, request bodies, status codes and pagination.
- [Engineering decisions](docs/DECISIONS.md): SQL ownership filtering, cursor ordering, cascade deletion and compatibility limits.
- [Validation record](docs/VALIDATION.md): environment, evidence and remaining gaps.

```text
HTTP request → Express + JSON limits → JWT authentication → strict input schema
            → Prisma owner/parent filter → PostgreSQL
            → JSON response or consistent error envelope
```

Every resource is private to its creating account. Lists use a `(createdAt, id)` cursor with a default limit of 20 and maximum of 50. An inaccessible resource returns the same `404` as an absent one. A product delete also deletes its releases and notes through database foreign keys.

## Scope and compatibility

The extension replaces the original placeholder singular resource URLs with documented plural/nested routes. `/user` and `/signin` remain; the original sign-in route was missing a leading slash and registration did not await persistence. New passwords use scrypt; legacy bcrypt hashes are not converted and cannot sign in through this implementation. This branch is intended for synthetic accounts, not a drop-in authentication migration for an existing deployment.

JWTs expire after one hour; refresh, logout revocation, password recovery, email verification, team sharing, public release feeds and asset uploads are out of scope. The `asset` field stores a validated HTTP(S) URL; the server never fetches it. Status is an editable enum, not a release approval workflow. The original unused `Post` table remains for migration compatibility and has no API route.

The rate limiter is in memory and defaults to the direct client IP. Reverse-proxy configuration, distributed limiting, TLS termination, backups, deployment monitoring and load testing need separate work before hosting. No permissive CORS policy is enabled. Real accounts, cloud database credentials and external APIs are not required.

## Stop local services

Stop the API with Ctrl+C. `docker compose stop` stops this project's database while retaining its volume. The bundled database password is local-demo configuration, bound to loopback; replace it for any other environment. No repository visibility or production deployment is changed by these commands.
