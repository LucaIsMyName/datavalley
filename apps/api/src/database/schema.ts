import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  locale: text('locale').notNull().default('en'),
  timezone: text('timezone').notNull().default('UTC'),
  theme: text('theme').notNull().default('system'),
  ...timestamps,
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const loginAttempts = pgTable('login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull(),
  ip: text('ip'),
  success: boolean('success').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const serviceAccounts = pgTable('service_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceAccountId: uuid('service_account_id').notNull().references(() => serviceAccounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  ipAllowlist: text('ip_allowlist').array().notNull(),
  rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(60),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
})

export const permissionGrants = pgTable('permission_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: uuid('resource_id'),
  action: text('action').notNull(),
  effect: text('effect').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id'),
  actorType: text('actor_type').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: uuid('resource_id'),
  metadata: jsonb('metadata').notNull().default({}),
  source: text('source').notNull(),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  icon: text('icon').notNull().default('FolderKanban'),
  settings: jsonb('settings').notNull().default({}),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  ...timestamps,
})

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })],
)

export const tables = pgTable(
  'tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').notNull().default('Table'),
    headerConfig: jsonb('header_config').notNull().default({}),
    footerConfig: jsonb('footer_config').notNull().default({}),
    formatRules: jsonb('format_rules').notNull().default([]),
    nextRowNumber: integer('next_row_number').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    ...timestamps,
  },
  (table) => [uniqueIndex('tables_project_name_idx').on(table.projectId, table.name)],
)

export const tableColumns = pgTable('table_columns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  type: text('type').notNull(),
  config: jsonb('config').notNull().default({}),
  position: text('position').notNull(),
  hidden: boolean('hidden').notNull().default(false),
  width: integer('width').notNull().default(180),
  frozen: boolean('frozen').notNull().default(false),
  ...timestamps,
})

export const tableTags = pgTable(
  'table_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
  },
  (table) => [uniqueIndex('table_tags_name_idx').on(table.tableId, table.name)],
)

export const tableStatuses = pgTable(
  'table_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    position: text('position').notNull(),
  },
  (table) => [uniqueIndex('table_statuses_name_idx').on(table.tableId, table.name)],
)

export const columnOptions = pgTable('column_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  columnId: uuid('column_id').notNull().references(() => tableColumns.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  color: text('color'),
  position: text('position').notNull(),
})

export const tableRows = pgTable('table_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
    position: text('position').notNull(),
    version: integer('version').notNull().default(1),
    color: text('color'),
    notes: text('notes').notNull().default(''),
    rowNumber: integer('row_number').notNull().default(0),
    createdBy: uuid('created_by'),
  ...timestamps,
})

export const tableCells = pgTable('table_cells', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  rowId: uuid('row_id').notNull().references(() => tableRows.id, { onDelete: 'cascade' }),
  columnId: uuid('column_id').notNull().references(() => tableColumns.id, { onDelete: 'cascade' }),
  valueText: text('value_text'),
  valueNumber: numeric('value_number', { precision: 19, scale: 4 }),
  valueBool: boolean('value_bool'),
  valueTimestamptz: timestamp('value_timestamptz', { withTimezone: true }),
    valueJsonb: jsonb('value_jsonb'),
    background: text('background'),
    ...timestamps,
  })

export const userFavorites = pgTable(
  'user_favorites',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.resourceType, table.resourceId] })],
)

export const userTableState = pgTable(
  'user_table_state',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
    sort: jsonb('sort'),
    filter: jsonb('filter'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tableId] })],
)

export const userRecentItems = pgTable('user_recent_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceType: text('resource_type').notNull(),
  resourceId: uuid('resource_id').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tableViews = pgTable('table_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  ownerId: uuid('owner_id'),
  shared: boolean('shared').notNull().default(false),
  definition: jsonb('definition').notNull().default({}),
  ...timestamps,
})

export const backgroundJobs = pgTable('background_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  payload: jsonb('payload').notNull().default({}),
  result: jsonb('result'),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  createdBy: uuid('created_by'),
  ...timestamps,
})

export const formulas = pgTable(
  'formulas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
    columnId: uuid('column_id').references(() => tableColumns.id, { onDelete: 'cascade' }),
    rowId: uuid('row_id').notNull().references(() => tableRows.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    canonical: text('canonical').notNull(),
    ast: jsonb('ast').notNull(),
    crossesTables: boolean('crosses_tables').notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('formulas_column_row_idx').on(table.columnId, table.rowId)],
)

export const formulaDependencies = pgTable('formula_dependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  formulaId: uuid('formula_id').notNull().references(() => formulas.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id'),
  columnId: uuid('column_id'),
  rowId: uuid('row_id'),
})

export const formulaCache = pgTable(
  'formula_cache',
  {
    formulaId: uuid('formula_id').notNull().references(() => formulas.id, { onDelete: 'cascade' }),
    rowId: uuid('row_id').notNull().references(() => tableRows.id, { onDelete: 'cascade' }),
    permissionHash: text('permission_hash').notNull().default(''),
    versionHash: text('version_hash').notNull(),
    result: jsonb('result').notNull(),
  },
  (table) => [primaryKey({ columns: [table.formulaId, table.rowId, table.permissionHash] })],
)

export const relations = pgTable('relations', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromTableId: uuid('from_table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  toTableId: uuid('to_table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  fromColumnId: uuid('from_column_id').references(() => tableColumns.id, { onDelete: 'set null' }),
  toColumnId: uuid('to_column_id'),
  cardinality: text('cardinality').notNull(),
  onDelete: text('on_delete').notNull().default('restrict'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const relationRecords = pgTable('relation_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  relationId: uuid('relation_id').notNull().references(() => relations.id, { onDelete: 'cascade' }),
  fromRowId: uuid('from_row_id').notNull().references(() => tableRows.id, { onDelete: 'cascade' }),
  toRowId: uuid('to_row_id').notNull().references(() => tableRows.id, { onDelete: 'cascade' }),
})

export const plugins = pgTable('plugins', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  kind: text('kind').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  entry: text('entry'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pluginConfigurations = pgTable('plugin_configurations', {
  pluginId: text('plugin_id').primaryKey().references(() => plugins.id, { onDelete: 'cascade' }),
  config: jsonb('config').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pluginConnections = pgTable('plugin_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  pluginId: text('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  credentialsEncrypted: text('credentials_encrypted'),
  webhookSecretHash: text('webhook_secret_hash'),
  config: jsonb('config').notNull().default({}),
  ...timestamps,
})

export const pluginPermissions = pgTable(
  'plugin_permissions',
  {
    pluginId: text('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
  },
  (table) => [primaryKey({ columns: [table.pluginId, table.scope] })],
)

export const integrationSyncJobs = pgTable('integration_sync_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').notNull().references(() => pluginConnections.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  error: text('error'),
  stats: jsonb('stats').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  readAt: timestamp('read_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userTotp = pgTable('user_totp', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  secretEncrypted: text('secret_encrypted').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const recoveryCodes = pgTable('recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

export const mediaFiles = pgTable('media_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  storageKey: text('storage_key').notNull().unique(),
  originalName: text('original_name').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
