# Data connectors

Data connectors fetch HTTP feeds (JSON, CSV, XML, or HTML) and sync mapped fields into bound tables. Connectors are managed under **Integrations** in the web app.

## Scope

- **Organization**: admins create connectors usable in any project.
- **Project**: project managers create connectors visible only in that project.

Connectors do **not** create tables by themselves. When you create a table, choose **From connector** to create columns from the connector mapping and start an initial sync.

A table linked to a connector is read-only, and its tab shows a Connector badge. Scheduled syncs and **Sync** on that table overwrite mapped cells. **Disconnect** removes the link: the table becomes editable and stops receiving connector updates. **Connect connector** on an editable table links a connector again (columns must match by name) and syncs. That sync can overwrite values in mapped cells. Row identity from the previous link is kept, so reconnecting updates those rows instead of appending duplicates.

## Configuration

- **Feed URL**: must be public `http`/`https` (private networks are blocked).
- **API key**: stored encrypted with `CREDENTIALS_KEY`; never returned by the API.
- **Records path**: JSON dot path (e.g. `items`), CSV uses each row, XML/HTML use simple path/selector rules.
- **External id**: required for upsert and for “remove missing rows” retention.
- **Schedule**: manual, hourly, daily, or weekly (UTC buckets). Requires `REDIS_URL` and the worker process.

## Operations

- **Test fetch / preview**: returns sample mapped rows without writing data.
- **Run sync**: enqueues a background job (or runs inline when Redis is not configured).
- **Retention**: keep all rows forever, or delete table rows whose external id has been absent from the feed for N days.

## API

Routes live under `/api/v1/connectors` and `/api/v1/projects/:projectId/tables/from-connector`. See OpenAPI in non-production builds.
