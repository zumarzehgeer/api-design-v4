# Engineering decisions

## Extend the existing course project

The existing Product → Update → UpdatePoint schema gives this project a coherent workflow. `chat-app` is an incomplete GraphQL prototype; `tradingAgent` is an exchange-connected process rather than the database-backed Node API evidence this portfolio needs. Both Monk repositories were excluded at the owner's request. This extension retains the original course commit and credits Scott Moss's API Design with Node.js v4.

## Check ownership in the database operation

Product operations filter on both resource ID and authenticated owner. Release and note operations also filter through their exact parent and owner relationships. Writes use constrained Prisma `update`/`delete`/nested `connect`, so authorization is not a separate unchecked lookup followed by an unrestricted write. Cross-account and wrong-parent cases return 404, including child creation. Foreign-key cascades delete a product tree atomically. This deliberately supports a single owner, not teams or delegated roles.

## Validate at the HTTP boundary

Strict Zod schemas reject unknown properties rather than accepting ownership fields supplied by a caller. Text, UUID, enum, URL, body-size and pagination bounds are explicit. Express 5 forwards rejected async handlers to one error mapper; database details and request secrets do not reach responses or application logs. Rate limits are in-memory and are not a substitute for a deployment-wide abuse policy.

## Stable ordering without total counts

Lists order by `(createdAt, id)`, backed by an owner/parent-prefixed index. Cursors carry the last ordering tuple, not a required existing database row. A deleted cursor row therefore does not break the next page. Owner filtering is applied even if a caller constructs their own unsigned cursor. Pagination is not a consistent snapshot across requests; concurrent changes remain visible. Offset pagination and exact totals were omitted because the workflow does not need them.

## Password and token scope

New passwords use Node's asynchronous scrypt with random 16-byte salts, 64-byte keys and N=32768, r=8, p=3 (64MiB max allocation). Unknown users still perform a hash comparison. Tokens are HS256 with an explicit algorithm, issuer/audience, UUID subject and one-hour expiry. The secret must be at least 32 bytes and should be randomly generated. Tokens are not refreshable or individually revocable. Legacy bcrypt hashes from the unfinished starter are retained in the database but are not supported by new sign-in; an existing deployment needs a deliberate authentication migration before adoption.

## Preserve schema history and test the database

The original SQL migration stays unchanged. A new migration adds pagination indexes, timestamp defaults and cascading child foreign keys. The unused starter Post table remains. Tests create isolated PostgreSQL schemas, apply the actual migrations and exercise HTTP handlers with real database operations. A separate migration test creates the original schema, inserts synthetic existing data and applies the additive migration before checking preservation. Cleanup removes only schemas created by that test run. The compiled-server smoke check validates a real TCP listener, startup configuration and the runnable demo.

## Upgrade with evidence

Prisma 7.10.1 and its PostgreSQL driver adapter replace Prisma 5, alongside strict ESM/TypeScript compilation. CLI connection configuration lives in `prisma.config.ts`; the runtime adapter has explicit connection/idle timeouts. Express 5 replaces the unfinished Express 4 handlers. The lockfile is committed. These are deliberate compatibility changes, not a claim of drop-in production migration; build, real migrations and integration tests validate this project's supported local path.
