# API reference

Generated from the OpenAPI contract. This is the same reference as the in-app page at `/doc/api`.

## Health

### `GET /api/v1/health`

Check API health

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/health")
```

## Auth

### `GET /api/v1/auth/csrf`

Get a CSRF token

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/auth/csrf")
```

### `POST /api/v1/auth/login`

Sign in

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request<{ user: { id: string; username: string; email: string; role: string; disabled: boolean; mustChangePassword: boolean; locale: string; timezone: string; theme: string; createdAt: string }; mustChangePassword: boolean }>("/auth/login", {
  method: "POST",
  body: JSON.stringify({
    "login": "admin@example.com",
    "password": "secret"
  }),
})
```

### `POST /api/v1/auth/logout`

Sign out

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/auth/logout", {
  method: "POST",
})
```

### `GET /api/v1/auth/me`

Get me

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request<{ user: { id: string; username: string; email: string; role: string; disabled: boolean; mustChangePassword: boolean; locale: string; timezone: string; theme: string; createdAt: string } }>("/auth/me")
```

### `POST /api/v1/auth/forgot-password`

Forgot password

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/auth/forgot-password", {
  method: "POST",
  body: JSON.stringify({
    "email": "admin@example.com"
  }),
})
```

### `POST /api/v1/auth/reset-password`

Reset password

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/auth/reset-password", {
  method: "POST",
  body: JSON.stringify({
    "token": "token",
    "newPassword": "secret"
  }),
})
```

### `POST /api/v1/auth/change-password`

Change password

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/auth/change-password", {
  method: "POST",
  body: JSON.stringify({
    "currentPassword": "secret",
    "newPassword": "secret"
  }),
})
```

## Sessions

### `GET /api/v1/sessions`

List sessions

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/sessions")
```

### `DELETE /api/v1/sessions/{id}`

Delete a session

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/sessions/00000000-0000-4000-8000-000053bfd09d", {
  method: "DELETE",
})
```

## Users

### `GET /api/v1/users`

List users

**Path**

None

**Query**

- `offset` string (optional)
- `limit` string (optional)

**Example**

```ts
const result = await api.request("/users?offset=offset&limit=limit")
```

### `POST /api/v1/users`

Create an user

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request<{ user: { id: string; username: string; email: string; role: string; disabled: boolean; mustChangePassword: boolean; locale: string; timezone: string; theme: string; createdAt: string } }>("/users", {
  method: "POST",
  body: JSON.stringify({
    "username": "username",
    "email": "admin@example.com",
    "password": "secret",
    "role": "admin"
  }),
})
```

### `GET /api/v1/users/{id}`

Get an user

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/users/00000000-0000-4000-8000-000006a68e08")
```

### `PATCH /api/v1/users/{id}`

Update an user

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/users/00000000-0000-4000-8000-000006a68e08", {
  method: "PATCH",
  body: JSON.stringify({
    "username": "username",
    "email": "admin@example.com",
    "role": "admin",
    "locale": "locale",
    "timezone": "timezone",
    "theme": "light"
  }),
})
```

### `DELETE /api/v1/users/{id}`

Delete an user

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/users/00000000-0000-4000-8000-000006a68e08", {
  method: "DELETE",
})
```

### `POST /api/v1/users/{id}/reset-password`

Reset password an user

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/users/00000000-0000-4000-8000-000006a68e08/reset-password", {
  method: "POST",
  body: JSON.stringify({
    "password": "secret"
  }),
})
```

### `POST /api/v1/users/{id}/disable`

Disable an user

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/users/00000000-0000-4000-8000-000006a68e08/disable", {
  method: "POST",
})
```

### `POST /api/v1/users/{id}/enable`

Enable an user

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/users/00000000-0000-4000-8000-000006a68e08/enable", {
  method: "POST",
})
```

### `PUT /api/v1/users/{id}/permissions`

Replace user permissions

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/users/00000000-0000-4000-8000-000006a68e08/permissions", {
  method: "PUT",
  body: JSON.stringify({
    "grants": [
      {
        "action": "view",
        "effect": "allow"
      }
    ]
  }),
})
```

## Projects

### `GET /api/v1/projects`

List projects

**Path**

None

**Query**

- `includeArchived` string (optional)

**Example**

```ts
const result = await api.request("/projects?includeArchived=includeArchived")
```

### `POST /api/v1/projects`

Create a project

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects", {
  method: "POST",
  body: JSON.stringify({
    "name": "name"
  }),
})
```

### `POST /api/v1/projects/import`

Import a project

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/import", {
  method: "POST",
  body: JSON.stringify({
    "name": "name",
    "document": "document",
    "kind": "datavalley.project",
    "version": 1,
    "project": "project",
    "tables": [
      "tables"
    ],
    "formulas": [
      "formulas"
    ]
  }),
})
```

### `GET /api/v1/projects/{id}/export`

Export a project

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/export")
```

### `GET /api/v1/projects/{id}`

Get a project

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a")
```

### `PATCH /api/v1/projects/{id}`

Update a project

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a", {
  method: "PATCH",
  body: JSON.stringify({
    "name": "name",
    "description": "description",
    "settings": {},
    "icon": "icon"
  }),
})
```

### `DELETE /api/v1/projects/{id}`

Delete a project

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a", {
  method: "DELETE",
})
```

### `POST /api/v1/projects/{id}/archive`

Archive a project

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/archive", {
  method: "POST",
})
```

### `POST /api/v1/projects/{id}/restore`

Restore a project

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/restore", {
  method: "POST",
})
```

### `GET /api/v1/projects/{id}/directory`

Get directory

**Path**

- `id` string

**Query**

- `q` string (optional)

**Example**

```ts
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/directory?q=acme")
```

### `GET /api/v1/projects/{id}/members`

List members

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/members")
```

### `POST /api/v1/projects/{id}/members`

Create a member

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/members", {
  method: "POST",
  body: JSON.stringify({
    "username": "username"
  }),
})
```

### `PATCH /api/v1/projects/{id}/members/{userId}`

Update a member

**Path**

- `id` string
- `userId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/members/00000000-0000-4000-8000-0000ce2b2e46", {
  method: "PATCH",
  body: JSON.stringify({
    "disabled": false
  }),
})
```

### `DELETE /api/v1/projects/{id}/members/{userId}`

Delete a member

**Path**

- `id` string
- `userId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/members/00000000-0000-4000-8000-0000ce2b2e46", {
  method: "DELETE",
})
```

### `PUT /api/v1/projects/{id}/permissions`

Replace project permissions

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/permissions", {
  method: "PUT",
  body: JSON.stringify({
    "userId": "00000000-0000-4000-8000-0000ce2b2e46",
    "grants": [
      {
        "action": "view",
        "effect": "allow"
      }
    ]
  }),
})
```

### `GET /api/v1/projects/{id}/events`

List events

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/events")
```

### `POST /api/v1/projects/{id}/presence`

Create a presence

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000c479187a/presence", {
  method: "POST",
  body: JSON.stringify({
    "clear": false,
    "tableId": "00000000-0000-4000-8000-0000a3708989",
    "tableName": "tableName",
    "editing": false,
    "draft": "draft",
    "focus": {
      "kind": "cell"
    }
  }),
})
```

### `POST /api/v1/projects/{projectId}/tables/from-connector`

Create a from connector

**Path**

- `projectId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000caa9f214/tables/from-connector", {
  method: "POST",
  body: JSON.stringify({
    "connectorId": "00000000-0000-4000-8000-000066ce1e48"
  }),
})
```

### `GET /api/v1/projects/{projectId}/tables`

List tables

**Path**

- `projectId` string

**Query**

None

**Example**

```ts
const result = await api.request("/projects/00000000-0000-4000-8000-0000caa9f214/tables")
```

### `POST /api/v1/projects/{projectId}/tables`

Create a table

**Path**

- `projectId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000caa9f214/tables", {
  method: "POST",
  body: JSON.stringify({
    "name": "name",
    "description": "description",
    "template": "demo"
  }),
})
```

### `POST /api/v1/projects/{projectId}/tables/mirror`

Create a mirror

**Path**

- `projectId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000caa9f214/tables/mirror", {
  method: "POST",
  body: JSON.stringify({
    "sourceTableId": "00000000-0000-4000-8000-0000a91374ee"
  }),
})
```

### `PUT /api/v1/projects/{projectId}/tables/order`

Order a table

**Path**

- `projectId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000caa9f214/tables/order", {
  method: "PUT",
  body: JSON.stringify({
    "tableIds": [
      "tableIds"
    ]
  }),
})
```

### `POST /api/v1/projects/{projectId}/tables/import`

Import a table

**Path**

- `projectId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/projects/00000000-0000-4000-8000-0000caa9f214/tables/import", {
  method: "POST",
})
```

### `GET /api/v1/projects/{projectId}/connections`

List connections

**Path**

- `projectId` string

**Query**

None

**Example**

```ts
const result = await api.request("/projects/00000000-0000-4000-8000-0000caa9f214/connections")
```

## Connectors

### `GET /api/v1/connectors`

List connectors

**Path**

None

**Query**

- `projectId` string (optional)

**Example**

```ts
const result = await api.request("/connectors?projectId=00000000-0000-4000-8000-0000caa9f214")
```

### `POST /api/v1/connectors`

Create a connector

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/connectors", {
  method: "POST",
  body: JSON.stringify({
    "name": "name",
    "source": {
      "baseUrl": "baseUrl"
    },
    "format": "json",
    "parse": {
      "version": 1,
      "fields": [
        {
          "sourceKey": "sourceKey",
          "targetFieldKey": "targetFieldKey"
        }
      ]
    }
  }),
})
```

### `GET /api/v1/connectors/{id}`

Get a connector

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/connectors/00000000-0000-4000-8000-0000d1c495c6")
```

### `PATCH /api/v1/connectors/{id}`

Update a connector

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/connectors/00000000-0000-4000-8000-0000d1c495c6", {
  method: "PATCH",
  body: JSON.stringify({
    "name": "name",
    "icon": "icon",
    "projectId": "00000000-0000-4000-8000-0000caa9f214",
    "enabled": false,
    "source": {
      "baseUrl": "baseUrl"
    },
    "auth": {
      "type": "none"
    },
    "format": "json",
    "parse": {
      "version": 1,
      "fields": [
        {
          "sourceKey": "sourceKey",
          "targetFieldKey": "targetFieldKey"
        }
      ]
    },
    "schedule": {
      "preset": "manual"
    },
    "retention": {
      "mode": "forever"
    },
    "apiKey": "apiKey"
  }),
})
```

### `DELETE /api/v1/connectors/{id}`

Delete a connector

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/connectors/00000000-0000-4000-8000-0000d1c495c6", {
  method: "DELETE",
})
```

### `POST /api/v1/connectors/{id}/preview`

Create a preview

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/connectors/00000000-0000-4000-8000-0000d1c495c6/preview", {
  method: "POST",
  body: JSON.stringify({
    "limit": 1
  }),
})
```

### `POST /api/v1/connectors/{id}/sync`

Sync a connector

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/connectors/00000000-0000-4000-8000-0000d1c495c6/sync", {
  method: "POST",
  body: JSON.stringify({
    "tableId": "00000000-0000-4000-8000-0000a3708989"
  }),
})
```

### `POST /api/v1/connectors/{id}/bind-table`

Create a bind table

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/connectors/00000000-0000-4000-8000-0000d1c495c6/bind-table", {
  method: "POST",
  body: JSON.stringify({
    "tableId": "00000000-0000-4000-8000-0000a3708989"
  }),
})
```

### `GET /api/v1/connectors/{id}/history`

Get history

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/connectors/00000000-0000-4000-8000-0000d1c495c6/history")
```

## Tables

### `GET /api/v1/tables/{tableId}/binding`

Get binding

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/binding")
```

### `PATCH /api/v1/tables/{tableId}/binding`

Update a binding

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/binding", {
  method: "PATCH",
  body: JSON.stringify({
    "columnMap": {}
  }),
})
```

### `GET /api/v1/tables/{tableId}`

Get a table

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989")
```

### `PATCH /api/v1/tables/{tableId}`

Update a table

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989", {
  method: "PATCH",
  body: JSON.stringify({
    "name": "name",
    "description": "description",
    "icon": "icon",
    "headerConfig": {},
    "footerConfig": {},
    "formatRules": [
      "formatRules"
    ]
  }),
})
```

### `DELETE /api/v1/tables/{tableId}`

Delete a table

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989", {
  method: "DELETE",
})
```

### `POST /api/v1/tables/{tableId}/archive`

Archive a table

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/archive", {
  method: "POST",
})
```

### `POST /api/v1/tables/{tableId}/duplicate`

Duplicate a table

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/duplicate", {
  method: "POST",
  body: JSON.stringify({
    "includeData": false
  }),
})
```

### `POST /api/v1/tables/{tableId}/lock`

Create a lock

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/lock", {
  method: "POST",
})
```

### `POST /api/v1/tables/{tableId}/unlock`

Create an unlock

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/unlock", {
  method: "POST",
})
```

### `POST /api/v1/tables/{tableId}/move`

Move a table

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/move", {
  method: "POST",
  body: JSON.stringify({
    "projectId": "00000000-0000-4000-8000-0000caa9f214"
  }),
})
```

### `POST /api/v1/tables/{tableId}/columns`

Create a column

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/columns", {
  method: "POST",
})
```

### `PUT /api/v1/tables/{tableId}/columns/order`

Order a column

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/columns/order", {
  method: "PUT",
  body: JSON.stringify({
    "columnIds": [
      "columnIds"
    ]
  }),
})
```

### `POST /api/v1/tables/{tableId}/columns/duplicate`

Duplicate a column

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/columns/duplicate", {
  method: "POST",
  body: JSON.stringify({
    "columnIds": [
      "columnIds"
    ]
  }),
})
```

### `GET /api/v1/tables/{tableId}/rows`

List rows

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/rows")
```

### `POST /api/v1/tables/{tableId}/rows`

Create a row

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/rows", {
  method: "POST",
  body: JSON.stringify({
    "cells": {},
    "beforeId": "00000000-0000-4000-8000-0000576864fa",
    "afterId": "00000000-0000-4000-8000-0000bfdd0817"
  }),
})
```

### `POST /api/v1/tables/{tableId}/rows/move`

Move a row

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/rows/move", {
  method: "POST",
  body: JSON.stringify({
    "rowId": "00000000-0000-4000-8000-0000067ab495"
  }),
})
```

### `PATCH /api/v1/tables/{tableId}/cells/bulk`

Bulk a cell

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/cells/bulk", {
  method: "PATCH",
  body: JSON.stringify({
    "updates": [
      {
        "rowId": "00000000-0000-4000-8000-0000067ab495",
        "version": 1,
        "cells": {}
      }
    ]
  }),
})
```

### `POST /api/v1/tables/{tableId}/rows/bulk-delete`

Bulk delete a row

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/rows/bulk-delete", {
  method: "POST",
  body: JSON.stringify({
    "rowIds": [
      "rowIds"
    ]
  }),
})
```

### `POST /api/v1/tables/{tableId}/rows/duplicate`

Duplicate a row

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/rows/duplicate", {
  method: "POST",
  body: JSON.stringify({
    "rowIds": [
      "rowIds"
    ]
  }),
})
```

### `POST /api/v1/tables/{tableId}/fill`

Fill a table

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/fill", {
  method: "POST",
  body: JSON.stringify({
    "columnId": "00000000-0000-4000-8000-0000dad75f11",
    "rowIds": [
      "rowIds"
    ]
  }),
})
```

### `POST /api/v1/tables/{tableId}/tags`

Create a tag

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/tags", {
  method: "POST",
})
```

### `PATCH /api/v1/tables/{tableId}/tags/{tagId}`

Update a tag

**Path**

- `tableId` string
- `tagId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/tags/00000000-0000-4000-8000-000006904a55", {
  method: "PATCH",
})
```

### `POST /api/v1/tables/{tableId}/statuses`

Create a statuse

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/statuses", {
  method: "POST",
})
```

### `PATCH /api/v1/tables/{tableId}/statuses/{statusId}`

Update a statuse

**Path**

- `tableId` string
- `statusId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/statuses/00000000-0000-4000-8000-00004e99a4ad", {
  method: "PATCH",
})
```

### `GET /api/v1/tables/{tableId}/footer`

Get footer

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/footer")
```

### `POST /api/v1/tables/{tableId}/import`

Import a table

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/import", {
  method: "POST",
})
```

### `POST /api/v1/tables/{tableId}/export`

Export a table

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/export", {
  method: "POST",
  body: JSON.stringify({
    "filter": "filter"
  }),
})
```

### `GET /api/v1/tables/{tableId}/state`

Get state

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/state")
```

### `PUT /api/v1/tables/{tableId}/state`

Replace table state

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/state", {
  method: "PUT",
})
```

### `GET /api/v1/tables/{tableId}/views`

List views

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/views")
```

### `POST /api/v1/tables/{tableId}/views`

Create a view

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/views", {
  method: "POST",
})
```

### `PATCH /api/v1/tables/{tableId}/views/{viewId}`

Update a view

**Path**

- `tableId` string
- `viewId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/views/00000000-0000-4000-8000-0000cf532ea0", {
  method: "PATCH",
})
```

### `DELETE /api/v1/tables/{tableId}/views/{viewId}`

Delete a view

**Path**

- `tableId` string
- `viewId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/views/00000000-0000-4000-8000-0000cf532ea0", {
  method: "DELETE",
})
```

### `POST /api/v1/tables/{tableId}/conditions/compile`

Create a compile

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/conditions/compile", {
  method: "POST",
})
```

### `POST /api/v1/tables/{tableId}/formulas/fill`

Fill a formula

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/formulas/fill", {
  method: "POST",
})
```

### `GET /api/v1/tables/{tableId}/formula-catalog`

Get formula catalog

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/formula-catalog")
```

### `POST /api/v1/tables/{tableId}/relations`

Create a relation

**Path**

- `tableId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/tables/00000000-0000-4000-8000-0000a3708989/relations", {
  method: "POST",
})
```

## Search

### `GET /api/v1/search`

Search records

**Path**

None

**Query**

- `q` string (optional)
- `locale` "en" | "de" (optional)

**Example**

```ts
const result = await api.request("/search?q=acme&locale=en")
```

## Ai

### `GET /api/v1/ai/status`

List status

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/ai/status")
```

### `GET /api/v1/ai/settings`

List settings

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/ai/settings")
```

### `PUT /api/v1/ai/settings`

Replace ai settings

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/ai/settings", {
  method: "PUT",
  body: JSON.stringify({
    "provider": "openai",
    "model": "model",
    "enabled": false
  }),
})
```

### `GET /api/v1/ai/models`

List models

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/ai/models")
```

### `POST /api/v1/ai/chat`

Create a chat

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/ai/chat", {
  method: "POST",
  body: JSON.stringify({
    "messages": [
      {
        "role": "user",
        "content": "content"
      }
    ]
  }),
})
```

### `POST /api/v1/ai/formula`

Create a formula

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/ai/formula", {
  method: "POST",
  body: JSON.stringify({
    "prompt": "prompt",
    "tableId": "00000000-0000-4000-8000-0000a3708989"
  }),
})
```

### `POST /api/v1/ai/connectors/draft`

Create a draft

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/ai/connectors/draft", {
  method: "POST",
  body: JSON.stringify({
    "prompt": "prompt",
    "url": "url"
  }),
})
```

## Columns

### `PATCH /api/v1/columns/{columnId}`

Update a column

**Path**

- `columnId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/columns/00000000-0000-4000-8000-0000dad75f11", {
  method: "PATCH",
})
```

### `DELETE /api/v1/columns/{columnId}`

Delete a column

**Path**

- `columnId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/columns/00000000-0000-4000-8000-0000dad75f11", {
  method: "DELETE",
})
```

### `POST /api/v1/columns/{columnId}/options`

Create an option

**Path**

- `columnId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/columns/00000000-0000-4000-8000-0000dad75f11/options", {
  method: "POST",
  body: JSON.stringify({
    "label": "label"
  }),
})
```

### `PATCH /api/v1/columns/{columnId}/options/{optionId}`

Update an option

**Path**

- `columnId` string
- `optionId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/columns/00000000-0000-4000-8000-0000dad75f11/options/00000000-0000-4000-8000-0000fb4a4870", {
  method: "PATCH",
  body: JSON.stringify({
    "label": "label",
    "color": "color",
    "position": "position"
  }),
})
```

### `DELETE /api/v1/columns/{columnId}/options/{optionId}`

Delete an option

**Path**

- `columnId` string
- `optionId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/columns/00000000-0000-4000-8000-0000dad75f11/options/00000000-0000-4000-8000-0000fb4a4870", {
  method: "DELETE",
})
```

### `POST /api/v1/columns/{columnId}/convert`

Convert a column

**Path**

- `columnId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/columns/00000000-0000-4000-8000-0000dad75f11/convert", {
  method: "POST",
  body: JSON.stringify({
    "type": "type"
  }),
})
```

### `POST /api/v1/columns/{columnId}/relation`

Create a relation

**Path**

- `columnId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/columns/00000000-0000-4000-8000-0000dad75f11/relation", {
  method: "POST",
  body: JSON.stringify({
    "toTableId": "00000000-0000-4000-8000-0000404de28e",
    "cardinality": "cardinality"
  }),
})
```

### `POST /api/v1/columns/{columnId}/formula`

Create a formula

**Path**

- `columnId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/columns/00000000-0000-4000-8000-0000dad75f11/formula", {
  method: "POST",
})
```

## Rows

### `PATCH /api/v1/rows/{rowId}`

Update a row

**Path**

- `rowId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/rows/00000000-0000-4000-8000-0000067ab495", {
  method: "PATCH",
  body: JSON.stringify({
    "version": 1
  }),
})
```

### `DELETE /api/v1/rows/{rowId}`

Delete a row

**Path**

- `rowId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/rows/00000000-0000-4000-8000-0000067ab495", {
  method: "DELETE",
})
```

### `GET /api/v1/rows/{rowId}/columns/{columnId}/formula`

Get formula

**Path**

- `rowId` string
- `columnId` string

**Query**

None

**Example**

```ts
const result = await api.request("/rows/00000000-0000-4000-8000-0000067ab495/columns/00000000-0000-4000-8000-0000dad75f11/formula")
```

### `POST /api/v1/rows/{rowId}/columns/{columnId}/formula`

Create a formula

**Path**

- `rowId` string
- `columnId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/rows/00000000-0000-4000-8000-0000067ab495/columns/00000000-0000-4000-8000-0000dad75f11/formula", {
  method: "POST",
})
```

## Formulas

### `POST /api/v1/formulas/validate`

Validate a formula

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/formulas/validate", {
  method: "POST",
  body: JSON.stringify({
    "tableId": "00000000-0000-4000-8000-0000a3708989",
    "expression": "expression"
  }),
})
```

### `POST /api/v1/formulas/evaluate`

Evaluate a formula

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/formulas/evaluate", {
  method: "POST",
})
```

### `GET /api/v1/formulas/{id}/dependencies`

List dependencies

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/formulas/00000000-0000-4000-8000-00001c4adbcd/dependencies")
```

## Relations

### `DELETE /api/v1/relations/{id}`

Delete a relation

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/relations/00000000-0000-4000-8000-0000ff8b45f7", {
  method: "DELETE",
})
```

### `POST /api/v1/relations/{id}/records`

Create a record

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/relations/00000000-0000-4000-8000-0000ff8b45f7/records", {
  method: "POST",
})
```

## Favorites

### `GET /api/v1/favorites`

List favorites

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/favorites")
```

### `POST /api/v1/favorites`

Create a favorite

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/favorites", {
  method: "POST",
})
```

### `DELETE /api/v1/favorites`

Delete a favorite

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/favorites", {
  method: "DELETE",
})
```

## Recents

### `GET /api/v1/recents`

List recents

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/recents")
```

## Plugins

### `GET /api/v1/plugins`

List plugins

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/plugins")
```

### `POST /api/v1/plugins/{id}/enable`

Enable a plugin

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/plugins/00000000-0000-4000-8000-0000e3a677a0/enable", {
  method: "POST",
})
```

### `POST /api/v1/plugins/{id}/disable`

Disable a plugin

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/plugins/00000000-0000-4000-8000-0000e3a677a0/disable", {
  method: "POST",
})
```

### `POST /api/v1/plugins/{id}/configure`

Configure a plugin

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/plugins/00000000-0000-4000-8000-0000e3a677a0/configure", {
  method: "POST",
})
```

## API keys

### `GET /api/v1/api-keys`

List api keys

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/api-keys")
```

### `POST /api/v1/api-keys`

Create an API key

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/api-keys", {
  method: "POST",
})
```

### `POST /api/v1/api-keys/{id}/rotate`

Rotate an API key

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/api-keys/00000000-0000-4000-8000-000036e515c7/rotate", {
  method: "POST",
})
```

### `POST /api/v1/api-keys/{id}/revoke`

Revoke an API key

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/api-keys/00000000-0000-4000-8000-000036e515c7/revoke", {
  method: "POST",
})
```

### `DELETE /api/v1/api-keys/{id}`

Delete an API key

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/api-keys/00000000-0000-4000-8000-000036e515c7", {
  method: "DELETE",
})
```

## Audit

### `GET /api/v1/audit`

List audit

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/audit")
```

## Notifications

### `GET /api/v1/notifications`

List notifications

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/notifications")
```

### `POST /api/v1/notifications/{id}/read`

Read a notification

**Path**

- `id` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/notifications/00000000-0000-4000-8000-00004bd694e8/read", {
  method: "POST",
})
```

## TOTP

### `POST /api/v1/totp/enroll`

Enroll

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/totp/enroll", {
  method: "POST",
})
```

### `POST /api/v1/totp/confirm`

Confirm

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/totp/confirm", {
  method: "POST",
})
```

### `POST /api/v1/totp/disable`

Disable

**Path**

None

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/totp/disable", {
  method: "POST",
})
```

## Media

### `GET /api/v1/media`

List media

**Path**

None

**Query**

- `limit` string (optional)
- `cursor` string (optional)
- `q` string (optional)
- `mime` "image" | "pdf" (optional)

**Example**

```ts
const result = await api.request("/media?limit=limit&cursor=cursor&q=acme&mime=image")
```

### `POST /api/v1/media`

Create a media

**Path**

None

**Query**

- `tableId` string (optional)

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/media?tableId=00000000-0000-4000-8000-0000a3708989", {
  method: "POST",
})
```

### `GET /api/v1/media/{id}/details`

List details

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/media/00000000-0000-4000-8000-0000062f6fe4/details")
```

### `GET /api/v1/media/{id}`

Get a media

**Path**

- `id` string

**Query**

None

**Example**

```ts
const result = await api.request("/media/00000000-0000-4000-8000-0000062f6fe4")
```

## Integrations

### `GET /api/v1/integrations/google-sheets/connect`

Connect a google-sheet

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/integrations/google-sheets/connect")
```

### `GET /api/v1/integrations/google-sheets/callback`

Callback a google-sheet

**Path**

None

**Query**

None

**Example**

```ts
const result = await api.request("/integrations/google-sheets/callback")
```

### `GET /api/v1/integrations/{connectionId}/history`

Get history

**Path**

- `connectionId` string

**Query**

None

**Example**

```ts
const result = await api.request("/integrations/00000000-0000-4000-8000-000072a04899/history")
```

### `POST /api/v1/integrations/{connectionId}/sync`

Sync an integration

**Path**

- `connectionId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/integrations/00000000-0000-4000-8000-000072a04899/sync", {
  method: "POST",
})
```

### `POST /api/v1/integrations/{connectionId}/webhook`

Webhook an integration

**Path**

- `connectionId` string

**Query**

None

**Example**

```ts
await api.ensureCsrf()
const result = await api.request("/integrations/00000000-0000-4000-8000-000072a04899/webhook", {
  method: "POST",
})
```
