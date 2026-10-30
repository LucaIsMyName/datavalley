# Plugins

Builtin plugins register through `@datavalley/plugin-sdk` and run in the API process. CSV import and export is the reference plugin. Google Sheets is optional and uses operator-supplied `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The app does not embed a Google client secret.

Plugin code does not receive a database handle. It receives a host API that checks scopes such as `rows:read` and `rows:write`. A disabled plugin does not run. Saved credentials are encrypted with `CREDENTIALS_KEY` and are not returned by read APIs.

Untrusted plugins run in `apps/worker/src/plugin-host.ts`. The host removes `DATABASE_URL`, session secrets, and the credentials key before loading the plugin, then gives it only a scoped token and the API base URL. The API process does not import third-party plugin source.

Webhook deliveries must send `x-datavalley-signature`, the hex HMAC-SHA256 of the raw body using the connection secret.
