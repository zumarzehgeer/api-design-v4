# API reference

Base URL: `http://127.0.0.1:3001`. Send JSON with `Content-Type: application/json`. Except `/health`, `/user` and `/signin`, all routes require `Authorization: Bearer <token>`.

## Authentication

`POST /user` registers a synthetic/local account and returns `201`:

```json
{ "username": "demo_reviewer", "password": "use-a-long-local-demo-password" }
```

`POST /signin` accepts the same body and returns `200`. Both responses contain `{ "data": { "id": "UUID", "username": "demo_reviewer" }, "token": "...", "expiresIn": 3600 }`. Password hashes are never returned. Usernames are trimmed/lowercased, 3–40 characters, using only `a-z`, digits, `_` and `-`. Passwords are 12–128 characters and are not trimmed. Unknown fields are rejected.

Duplicate usernames return `409 CONFLICT`; unknown usernames and incorrect passwords share `401 INVALID_CREDENTIALS`. Bearer verification checks HS256, subject UUID, expiry, issuer, audience and account existence. Missing/invalid bearer tokens return `401 UNAUTHORIZED`. Authentication endpoints share an in-memory limit of 30 requests per IP per 15 minutes, including failed validation; exceeding it returns `429 RATE_LIMITED`.

## Resource routes

Each collection supports `POST` (create, `201`) and `GET` (list, `200`). Each item supports `GET` (`200`), `PATCH` (`200`) and `DELETE` (`204`, no body).

| Resource       | Collection                                          | Item                                                         |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| Product        | `/api/products`                                     | `/api/products/:productId`                                   |
| Release update | `/api/products/:productId/updates`                  | `/api/products/:productId/updates/:updateId`                 |
| Release note   | `/api/products/:productId/updates/:updateId/points` | `/api/products/:productId/updates/:updateId/points/:pointId` |

All IDs must be UUIDs. A nested resource must belong to its exact URL parent and the current account. A create response sets `Location` to the item URL. Single-item responses use `{ "data": { ... } }`. Resource JSON includes generated IDs, timestamps and relationship IDs; no user/password object is nested in it.

### Product body

```json
{ "name": "Synthetic dispatch planner" }
```

Name is required, trimmed and 1–120 characters. A product patch takes the same body. The server derives ownership from the bearer token; supplying `belongsToId` is rejected.

### Release body

```json
{
  "title": "Explain route alternatives",
  "body": "Show sample weather impacts for each route.",
  "asset": "https://example.com/synthetic-release",
  "version": "1.0.0",
  "status": "IN_PROGRESS"
}
```

Title (1–255), body (1–10000) and asset (HTTP(S) URL, at most 2048) are required on create. Version is optional, nullable, trimmed and 1–40 characters when provided. Status defaults to `IN_PROGRESS`; allowed values are `IN_PROGRESS`, `LIVE`, `DEPRECATED`, `ARCHIVED`. Patch accepts any nonempty subset of these fields. Ownership and product IDs cannot be reassigned. `updatedAt` changes on writes through Prisma.

### Release-note body

```json
{
  "name": "Checkpoint details",
  "description": "Explain the synthetic weather at each checkpoint."
}
```

Name (1–255) and description (1–2000) are required and trimmed. Patch accepts a nonempty subset. The parent update ID comes from the URL.

### Pagination

All lists accept only `limit` and `cursor`:

```text
GET /api/products?limit=2
GET /api/products?limit=2&cursor=<previous page.nextCursor>
```

```json
{ "data": [], "page": { "nextCursor": null, "limit": 2 } }
```

Order is ascending `(createdAt, id)`. Copy the opaque `nextCursor` into the next request; `null` means the end. Limits are integers 1–50, default 20. Tied timestamps are resolved by ID. Deleting the previous page's last row does not invalidate the cursor. A list is not a database snapshot: concurrent insertions/deletions may change subsequent pages. Cursors confer no access and owner/parent filtering is always reapplied. There are no total-count, search or filter parameters.

## Errors

```json
{ "error": { "code": "NOT_FOUND", "message": "Resource not found." } }
```

| HTTP | Code                                   | Meaning                                                                         |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`                     | Invalid fields, IDs or query parameters; includes `details` with paths/messages |
| 400  | `INVALID_JSON`                         | Malformed JSON                                                                  |
| 400  | `INVALID_CURSOR`                       | Cursor cannot be decoded/validated                                              |
| 401  | `INVALID_CREDENTIALS` / `UNAUTHORIZED` | Sign-in or bearer failure                                                       |
| 404  | `NOT_FOUND`                            | Missing route/resource, foreign account or incorrect parent                     |
| 409  | `CONFLICT`                             | Username already exists                                                         |
| 413  | `BODY_TOO_LARGE`                       | JSON body exceeds 32kb                                                          |
| 429  | `RATE_LIMITED`                         | Authentication request limit exceeded                                           |
| 500  | `INTERNAL_ERROR`                       | Unexpected server failure; no SQL/stack/credential details returned             |

Empty patches, unknown body fields, invalid enum values and non-HTTP(S) assets fail validation. Unknown legacy placeholder routes return an error instead of hanging.
