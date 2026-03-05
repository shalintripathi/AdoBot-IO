# Test Coverage Analysis

**Current coverage: 0%** — no test files, no test framework, no CI pipeline exist.

---

## Priority Areas for New Tests

### 1. Authentication Middleware (`middlewares/auth.js`) — **Critical**

This is the only access control layer protecting all admin routes. It has several untested logic paths:

| Scenario | Risk if broken |
|---|---|
| Valid credentials via headers → `next()` called | Admin routes completely unprotected |
| Valid credentials on `/login` path → `200` returned (not `next()`) | Double-auth bypass |
| Invalid/missing credentials → `401` returned | Unauthorized access to all admin data |
| Credentials in `req.body` vs `req.headers` (two code paths) | Silent auth bypass |
| Production env reads from `process.env` variables | Credentials leak/misconfiguration in prod |

**Suggested test cases:**
```
auth middleware
  ✓ returns 401 when no credentials are provided
  ✓ returns 401 when password is wrong
  ✓ returns 401 when username is wrong
  ✓ returns 200 on POST /login with correct credentials (does not call next)
  ✓ calls next() on other routes with correct credentials
  ✓ reads credentials from req.headers
  ✓ reads credentials from req.body when headers are absent
```

---

### 2. `formatCommand()` in `controllers/commands_ctrl.js` — **High**

A pure function with four distinct branches based on `arg1`/`arg2` values. Because it formats commands dispatched to devices, a formatting bug produces silently incorrect behavior (wrong command sent, no error thrown).

| Branch | Condition |
|---|---|
| No-args | `arg1 == ""` AND `arg2 == ""` → `command()` |
| arg2 only | `!arg1` (falsy, not empty-string) → `command(arg2)` |
| arg1 only | `!arg2` → `command(arg1)` |
| Both args | else → `command(arg1, arg2)` |

Note: the `arg1 == ""` check (loose equality) vs `!arg1` check (falsy) creates a subtle inconsistency worth verifying with edge cases (`null`, `undefined`, `"0"`, `0`).

**Suggested test cases:**
```
formatCommand
  ✓ both args empty string → "cmd()\n"
  ✓ arg1 present, arg2 absent → "cmd(arg1)\n"
  ✓ arg2 present, arg1 absent → "cmd(arg2)\n"
  ✓ both args present → "cmd(arg1, arg2)\n"
  ✓ arg1 = null, arg2 = "x" → "cmd(x)\n" (falsy vs empty-string edge case)
  ✓ arg1 = 0 (falsy number) behaves correctly
```

---

### 3. Bot Controller (`controllers/bots_ctrl.js`) — **High**

`updateStatus` implements an upsert pattern: it creates a new bot record if the UID is unknown, or updates an existing one. Both branches emit different Socket.IO events (`bot:created` vs `bot:updated`). Bugs here mean stale or duplicate records.

**Suggested test cases:**
```
bots_ctrl.updateStatus
  ✓ creates a new bot when UID does not exist → 201, emits bot:created
  ✓ updates existing bot when UID exists → 200, emits bot:updated
  ✓ sets status = true and updated = now on every call
  ✓ returns 500 on database error

bots_ctrl.delete
  ✓ cascades deletion across all related tables (messages, call_logs, commands, contacts, permissions)
  ✓ returns 500 when bot not found
  ✓ returns 200 on success

bots_ctrl.index
  ✓ returns all bots as JSON
  ✓ returns 500 on database error

bots_ctrl.show
  ✓ returns a single bot by ID
```

---

### 4. Commands Controller (`controllers/commands_ctrl.js`) — **High**

`addCommand` has two completely different code paths depending on whether the target bot is currently connected via Socket.IO:

- **Online bot**: command is emitted directly to the socket, nothing is persisted.
- **Offline bot**: command is persisted to the database and emitted to the admin panel.

This dual-path logic is a prime candidate for regression bugs and is completely untested.

**Suggested test cases:**
```
commands_ctrl.addCommand
  ✓ when bot is online and socket connected → emits command to socket, returns 201
  ✓ when bot is online but socket not found → returns 422
  ✓ when bot is offline → persists command to DB, emits command:added to admin, returns command JSON
  ✓ returns 422 on DB create failure

commands_ctrl.getCommands
  ✓ returns formatted command string and destroys commands after retrieval
  ✓ emits commands:deleted after clearing
  ✓ returns empty response when no commands exist

commands_ctrl.pendingCommands
  ✓ returns formatted list of pending commands with IDs

commands_ctrl.delete
  ✓ destroys command by ID, emits command:deleted, returns 200
```

---

### 5. Socket Bot Handler (`socket/bot_handler.js`) — **Medium**

The socket handler manages real-time device lifecycle (connect, disconnect, pending command replay). Bugs here cause devices to appear online when offline or vice versa.

**Suggested test cases:**
```
BotHandler
  ✓ registerDevice: creates new DB record for unknown UID, emits bot:created
  ✓ registerDevice: updates existing record for known UID, emits bot:connected
  ✓ registerDevice: sets status=true, socket_id, updated fields
  ✓ deviceDisconnected: sets status=false for matching uid+socket_id, emits bot:disconnected
  ✓ deviceDisconnected: no-op when no matching bot found
  ✓ performPendingCommands: emits all pending commands to socket, then destroys them, emits commands:cleared
  ✓ init: calls registerDevice, attachHandlers, and performPendingCommands
```

---

### 6. API Route Registration (`routes.js`) — **Medium**

All admin routes should require the `auth` middleware. A missing `auth` argument on any route silently exposes it.

**Suggested test cases:**
```
routes
  ✓ POST /login — does not require auth beyond the login handler itself
  ✓ GET /bots — requires auth (returns 401 without credentials)
  ✓ DELETE /bots/:id — requires auth
  ✓ POST /add-command — requires auth
  ✓ GET /get-commands — requires auth
  ✓ DELETE /commands/:id — requires auth
  ✓ GET /get-messages/:uid — requires auth
  ✓ GET /call-logs/:uid — requires auth
  ✓ GET /contacts/:uid — requires auth
  ✓ POST /status/:uid — does NOT require auth (bot route)
  ✓ GET /pending-commands — does NOT require auth (bot route)
  ✓ POST /call-logs — does NOT require auth (bot route)
  ✓ POST /message — does NOT require auth (bot route)
  ✓ POST /contacts — does NOT require auth (bot route)
```

---

### 7. Remaining Controllers — **Medium**

These controllers follow the same pattern as the above and should have basic happy-path and error-path coverage:

- `controllers/messages_ctrl.js` — `getMessages`, `addMessage`, `clearMessages`
- `controllers/call_log_ctrl.js` — `showLogs`, `create`, `clear`
- `controllers/contacts_ctrl.js` — `getContacts`, `create`, `clear`
- `controllers/permissions_ctrl.js` — `getPermissions`, `updatePermissions`
- `controllers/notifications_ctrl.js` — `notify`

---

## Recommended Testing Stack

| Tool | Purpose |
|---|---|
| [Mocha](https://mochajs.org/) | Test runner (natural fit for Node.js/Express) |
| [Chai](https://www.chaijs.com/) | Assertions (`expect`/`should` style) |
| [Sinon](https://sinonjs.org/) | Stubs/spies for Sequelize models and Socket.IO |
| [supertest](https://github.com/ladjs/supertest) | HTTP integration tests against the Express app |

Add to `package.json`:
```json
"devDependencies": {
  "mocha": "^10.0.0",
  "chai": "^4.0.0",
  "sinon": "^15.0.0",
  "supertest": "^6.0.0"
}
```

Add a test script:
```json
"scripts": {
  "test": "mocha 'test/**/*.test.js'"
}
```

---

## Suggested Test File Layout

```
test/
├── middlewares/
│   └── auth.test.js
├── controllers/
│   ├── bots_ctrl.test.js
│   ├── commands_ctrl.test.js
│   ├── messages_ctrl.test.js
│   ├── call_log_ctrl.test.js
│   ├── contacts_ctrl.test.js
│   ├── permissions_ctrl.test.js
│   └── notifications_ctrl.test.js
├── socket/
│   └── bot_handler.test.js
└── routes.test.js
```

---

## Summary

| Area | Priority | Reason |
|---|---|---|
| `middlewares/auth.js` | Critical | Only access control; multiple logic branches |
| `formatCommand()` | High | Pure function; subtle arg-handling bugs |
| `bots_ctrl` | High | Upsert logic; cascade delete |
| `commands_ctrl` | High | Dual online/offline code path |
| `socket/bot_handler.js` | Medium | Real-time lifecycle; hard to debug manually |
| `routes.js` | Medium | Auth coverage on all admin routes |
| Remaining controllers | Medium | Basic CRUD correctness and error paths |
