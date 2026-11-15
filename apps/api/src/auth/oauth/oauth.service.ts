import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notExists,
  or,
} from 'drizzle-orm'
import * as crypto from 'node:crypto'
import { z } from 'zod'
import type { AccessTokenScope } from '#/auth/access-tokens/access-tokens.schema'
import { hashAccessToken } from '#/auth/access-tokens/access-tokens.service'
import { DatabaseService } from '#/database/database.service'
import type {
  AuthorizationDetailsDto,
  AuthorizeRequestDto,
  OAuthAuditEntryDto,
  OAuthGrantDto,
} from './dto/oauth.dto'
import {
  MAX_OAUTH_CLIENTS,
  OAUTH_ACCESS_TOKEN_PATTERN,
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_AUDIT_RETENTION_DAYS,
  OAUTH_CLIENT_ID_PREFIX,
  OAUTH_CLIENT_NAME_MAX_LENGTH,
  OAUTH_CODE_PATTERN,
  OAUTH_CODE_PREFIX,
  OAUTH_CODE_TTL_MS,
  OAUTH_DEFAULT_CLIENT_NAME,
  OAUTH_ERRORS,
  OAUTH_GRANT_MAX_LIFETIME_MS,
  OAUTH_LAST_USED_RESOLUTION_MS,
  OAUTH_PRUNE_INTERVAL_MS,
  OAUTH_RANDOM_BYTES,
  OAUTH_REFRESH_REUSE_GRACE_MS,
  OAUTH_REFRESH_TOKEN_PATTERN,
  OAUTH_REFRESH_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_TTL_MS,
  OAUTH_STATE_MAX_LENGTH,
  PKCE_CHALLENGE_PATTERN,
  PKCE_VERIFIER_PATTERN,
} from './oauth.constants'
import {
  type OAuthClient,
  oauthAuditTable,
  oauthAuthorizationCodesTable,
  oauthClientsTable,
  oauthGrantsTable,
  oauthTokensTable,
} from './oauth.schema'
import {
  canonicalResource,
  REMOTE_MCP_CONFIG,
  type RemoteMcpConfig,
} from './remote-mcp.config'

const DAY_MS = 24 * 60 * 60 * 1000

/** An RFC 6749 §5.2 / RFC 7591 §3.2.2 error, rendered as `{ error, error_description }`. */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description)
    this.name = 'OAuthError'
  }
}

export interface OAuthTokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

export interface AuthenticatedOAuthToken {
  grantId: string
  userId: string
  scope: AccessTokenScope
  expiresAt: Date
}

export interface OAuthUse {
  grantId: string
  method: string
  route: string
  statusCode: number
}

/** Space-separated OAuth scope string of a grant scope (`write` includes `read`). */
export const scopeString = (scope: AccessTokenScope) =>
  scope === 'write' ? 'read write' : 'read'

const secret = (prefix: string) =>
  prefix + crypto.randomBytes(OAUTH_RANDOM_BYTES).toString('base64url')

const s256 = (verifier: string) =>
  crypto.createHash('sha256').update(verifier).digest('base64url')

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

/** Strips control characters from a self-declared client name. */
function cleanClientName(name: unknown): string {
  if (typeof name !== 'string') return OAUTH_DEFAULT_CLIENT_NAME
  const cleaned = name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()
  return (
    cleaned.slice(0, OAUTH_CLIENT_NAME_MAX_LENGTH) || OAUTH_DEFAULT_CLIENT_NAME
  )
}

const registrationSchema = z.looseObject({
  redirect_uris: z.array(z.string().max(2048)).min(1).max(10),
  client_name: z.unknown().optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
})

const field = z.string().max(4096)
const tokenRequestSchema = z.discriminatedUnion('grant_type', [
  z.looseObject({
    grant_type: z.literal('authorization_code'),
    code: field,
    redirect_uri: field,
    client_id: field,
    code_verifier: field,
    resource: field.optional(),
  }),
  z.looseObject({
    grant_type: z.literal('refresh_token'),
    refresh_token: field,
    client_id: field,
    scope: field.optional(),
    resource: field.optional(),
  }),
])

interface ValidatedAuthorization {
  client: OAuthClient
  redirectUri: string
  requestedScope: AccessTokenScope
  state: string | undefined
  resource: string
}

/**
 * OAuth 2.1 authorization server for the remote MCP endpoint (#78, ADR 0003):
 * Dynamic Client Registration (public clients, allow-listed redirect URIs),
 * authorization code + PKCE S256, rotating refresh tokens with reuse
 * detection, revocation, and the validation of access tokens for `JwtGuard`.
 * Codes and tokens are stored as SHA-256 hashes and never logged.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name)
  private lastPruneAt = 0

  // Explicit @Inject: under tsx (the OpenAPI generator) the reflected type of
  // the first parameter came out undefined.
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(REMOTE_MCP_CONFIG) private readonly config: RemoteMcpConfig,
  ) {}

  private get db() {
    return this.database.db
  }

  get enabled(): boolean {
    return this.config.enabled
  }

  /** RFC 8414 authorization server metadata. */
  metadata() {
    const { issuer } = this.config
    return {
      issuer,
      authorization_endpoint: this.config.authorizationEndpoint,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      scopes_supported: ['read', 'write'],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    }
  }

  // --- Dynamic Client Registration (RFC 7591) -------------------------------

  async registerClient(body: unknown, now = new Date()) {
    const parsed = registrationSchema.safeParse(body)
    if (!parsed.success) {
      throw new OAuthError(
        'invalid_client_metadata',
        'redirect_uris is required (1 to 10 URIs)',
      )
    }
    const input = parsed.data
    const allowed = new Set(this.config.redirectUris)
    if (!input.redirect_uris.every((uri) => allowed.has(uri))) {
      throw new OAuthError(
        'invalid_redirect_uri',
        'This server only accepts its allow-listed redirect URIs',
      )
    }
    if (
      input.token_endpoint_auth_method !== undefined &&
      input.token_endpoint_auth_method !== 'none'
    ) {
      throw new OAuthError(
        'invalid_client_metadata',
        'Only public clients are supported (token_endpoint_auth_method "none")',
      )
    }
    const grantTypes = input.grant_types ?? ['authorization_code']
    if (
      !grantTypes.every((type) =>
        ['authorization_code', 'refresh_token'].includes(type),
      )
    ) {
      throw new OAuthError(
        'invalid_client_metadata',
        'Supported grant types: authorization_code, refresh_token',
      )
    }
    if (
      input.response_types &&
      !input.response_types.every((t) => t === 'code')
    ) {
      throw new OAuthError(
        'invalid_client_metadata',
        'Supported response type: code',
      )
    }

    await this.makeRoomForClient()
    const redirectUris = [...new Set(input.redirect_uris)]
    const [client] = await this.db
      .insert(oauthClientsTable)
      .values({
        clientId: secret(OAUTH_CLIENT_ID_PREFIX).slice(0, 40),
        clientName: cleanClientName(input.client_name),
        redirectUris,
        createdAt: now,
      })
      .returning()
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
  }

  /**
   * Keeps at most `MAX_OAUTH_CLIENTS` - 1 clients before an insert by deleting
   * the oldest ones that never got a grant. A connected client is never
   * evicted: when all of them are, registration is refused.
   */
  private async makeRoomForClient(): Promise<void> {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(oauthClientsTable)
    if (total < MAX_OAUTH_CLIENTS) return
    const unused = await this.db
      .select({ id: oauthClientsTable.id })
      .from(oauthClientsTable)
      .where(
        notExists(
          this.db
            .select({ id: oauthGrantsTable.id })
            .from(oauthGrantsTable)
            .where(eq(oauthGrantsTable.clientId, oauthClientsTable.id)),
        ),
      )
      .orderBy(asc(oauthClientsTable.createdAt))
      .limit(total - MAX_OAUTH_CLIENTS + 1)
    if (unused.length < total - MAX_OAUTH_CLIENTS + 1) {
      throw new OAuthError(
        'invalid_client_metadata',
        'Too many registered clients',
      )
    }
    await this.db.delete(oauthClientsTable).where(
      inArray(
        oauthClientsTable.id,
        unused.map((row) => row.id),
      ),
    )
  }

  // --- Authorization (consent page) -----------------------------------------

  private async validateAuthorization(
    params: AuthorizeRequestDto,
  ): Promise<ValidatedAuthorization> {
    const [client] = params.client_id
      ? await this.db
          .select()
          .from(oauthClientsTable)
          .where(eq(oauthClientsTable.clientId, params.client_id))
          .limit(1)
      : []
    if (!client) throw new BadRequestException(OAUTH_ERRORS.UNKNOWN_CLIENT)
    const redirectUri = params.redirect_uri
    if (
      !redirectUri ||
      !client.redirectUris.includes(redirectUri) ||
      !this.config.redirectUris.includes(redirectUri)
    ) {
      throw new BadRequestException(OAUTH_ERRORS.INVALID_REDIRECT_URI)
    }
    if (params.response_type !== 'code') {
      throw new BadRequestException(OAUTH_ERRORS.UNSUPPORTED_RESPONSE_TYPE)
    }
    if (
      params.code_challenge_method !== 'S256' ||
      !params.code_challenge ||
      !PKCE_CHALLENGE_PATTERN.test(params.code_challenge)
    ) {
      throw new BadRequestException(OAUTH_ERRORS.INVALID_PKCE)
    }
    const scopes = (params.scope ?? '').split(' ').filter(Boolean)
    if (!scopes.every((scope) => scope === 'read' || scope === 'write')) {
      throw new BadRequestException(OAUTH_ERRORS.INVALID_SCOPE)
    }
    if (
      params.state !== undefined &&
      params.state.length > OAUTH_STATE_MAX_LENGTH
    ) {
      throw new BadRequestException(OAUTH_ERRORS.INVALID_STATE)
    }
    return {
      client,
      redirectUri,
      requestedScope: scopes.includes('write') ? 'write' : 'read',
      state: params.state,
      resource: this.checkResource(params.resource, () => {
        throw new BadRequestException(OAUTH_ERRORS.INVALID_TARGET)
      }),
    }
  }

  /** RFC 8707: the only resource is the MCP endpoint; absent means it. */
  private checkResource(resource: string | undefined, fail: () => never) {
    if (resource === undefined) return this.config.resource
    return canonicalResource(resource) === this.config.resource
      ? this.config.resource
      : fail()
  }

  private redirect(
    redirectUri: string,
    params: Record<string, string | undefined>,
  ): string {
    const url = new URL(redirectUri)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value)
    }
    url.searchParams.set('iss', this.config.issuer)
    return url.href
  }

  async authorizationDetails(
    params: AuthorizeRequestDto,
  ): Promise<AuthorizationDetailsDto> {
    const request = await this.validateAuthorization(params)
    return {
      clientName: request.client.clientName,
      redirectHost: new URL(request.redirectUri).host,
      requestedScope: request.requestedScope,
    }
  }

  /** The owner approved: a single-use code bound to the PKCE challenge. */
  async approve(
    userId: string,
    params: AuthorizeRequestDto,
    allowWrite: boolean,
    now = new Date(),
  ): Promise<{ redirectTo: string }> {
    const request = await this.validateAuthorization(params)
    const code = secret(OAUTH_CODE_PREFIX)
    await this.db.insert(oauthAuthorizationCodesTable).values({
      codeHash: hashAccessToken(code),
      clientId: request.client.id,
      userId,
      redirectUri: request.redirectUri,
      // Checked against PKCE_CHALLENGE_PATTERN above.
      codeChallenge: params.code_challenge!,
      scope:
        allowWrite && request.requestedScope === 'write' ? 'write' : 'read',
      resource: request.resource,
      expiresAt: new Date(now.getTime() + OAUTH_CODE_TTL_MS),
      createdAt: now,
    })
    return {
      redirectTo: this.redirect(request.redirectUri, {
        code,
        state: request.state,
      }),
    }
  }

  async deny(params: AuthorizeRequestDto): Promise<{ redirectTo: string }> {
    const request = await this.validateAuthorization(params)
    return {
      redirectTo: this.redirect(request.redirectUri, {
        error: 'access_denied',
        error_description: 'The owner refused the connection',
        state: request.state,
      }),
    }
  }

  // --- Token endpoint ---------------------------------------------------------

  async token(body: unknown, now = new Date()): Promise<OAuthTokenResponse> {
    const grantType =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>)['grant_type']
        : undefined
    if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
      throw new OAuthError(
        grantType === undefined ? 'invalid_request' : 'unsupported_grant_type',
        'grant_type must be authorization_code or refresh_token',
      )
    }
    const parsed = tokenRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new OAuthError('invalid_request', 'Missing or invalid parameters')
    }
    return parsed.data.grant_type === 'authorization_code'
      ? this.exchangeCode(parsed.data, now)
      : this.refresh(parsed.data, now)
  }

  private async exchangeCode(
    input: {
      code: string
      redirect_uri: string
      client_id: string
      code_verifier: string
      resource?: string
    },
    now: Date,
  ): Promise<OAuthTokenResponse> {
    const invalid = () =>
      new OAuthError('invalid_grant', 'Invalid authorization code')
    if (!OAUTH_CODE_PATTERN.test(input.code)) throw invalid()
    const codeHash = hashAccessToken(input.code)

    // Consumed whatever happens next: a code is tried once.
    const [code] = await this.db
      .update(oauthAuthorizationCodesTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(oauthAuthorizationCodesTable.codeHash, codeHash),
          isNull(oauthAuthorizationCodesTable.usedAt),
        ),
      )
      .returning()
    if (!code) {
      const [replayed] = await this.db
        .select({ grantId: oauthAuthorizationCodesTable.grantId })
        .from(oauthAuthorizationCodesTable)
        .where(eq(oauthAuthorizationCodesTable.codeHash, codeHash))
        .limit(1)
      if (replayed?.grantId) {
        await this.revokeGrantTokens(replayed.grantId, now)
        this.logger.warn('OAuth authorization code replayed: grant revoked')
      }
      throw invalid()
    }

    const [client] = await this.db
      .select()
      .from(oauthClientsTable)
      .where(eq(oauthClientsTable.id, code.clientId))
      .limit(1)
    if (
      code.expiresAt <= now ||
      !client ||
      client.clientId !== input.client_id ||
      code.redirectUri !== input.redirect_uri ||
      !PKCE_VERIFIER_PATTERN.test(input.code_verifier) ||
      !safeEqual(s256(input.code_verifier), code.codeChallenge)
    ) {
      throw invalid()
    }
    this.checkResource(input.resource, () => {
      throw new OAuthError('invalid_target', 'Unknown resource')
    })

    return this.db.transaction(async (tx) => {
      const [grant] = await tx
        .insert(oauthGrantsTable)
        .values({
          userId: code.userId,
          clientId: code.clientId,
          scope: code.scope,
          resource: code.resource,
          expiresAt: new Date(now.getTime() + OAUTH_GRANT_MAX_LIFETIME_MS),
          createdAt: now,
        })
        .returning()
      await tx
        .update(oauthAuthorizationCodesTable)
        .set({ grantId: grant.id })
        .where(eq(oauthAuthorizationCodesTable.id, code.id))
      return this.issueTokens(tx, grant, now)
    })
  }

  private async refresh(
    input: {
      refresh_token: string
      client_id: string
      scope?: string
      resource?: string
    },
    now: Date,
  ): Promise<OAuthTokenResponse> {
    const invalid = () =>
      new OAuthError('invalid_grant', 'Invalid refresh token')
    if (!OAUTH_REFRESH_TOKEN_PATTERN.test(input.refresh_token)) throw invalid()
    const tokenHash = hashAccessToken(input.refresh_token)

    // Rotation: only one request can spend a refresh token.
    const [spent] = await this.db
      .update(oauthTokensTable)
      .set({ rotatedAt: now, revokedAt: now })
      .where(
        and(
          eq(oauthTokensTable.tokenHash, tokenHash),
          eq(oauthTokensTable.kind, 'refresh'),
          isNull(oauthTokensTable.revokedAt),
          gt(oauthTokensTable.expiresAt, now),
        ),
      )
      .returning({ grantId: oauthTokensTable.grantId })
    if (!spent) {
      const [known] = await this.db
        .select({
          grantId: oauthTokensTable.grantId,
          rotatedAt: oauthTokensTable.rotatedAt,
        })
        .from(oauthTokensTable)
        .where(
          and(
            eq(oauthTokensTable.tokenHash, tokenHash),
            eq(oauthTokensTable.kind, 'refresh'),
          ),
        )
        .limit(1)
      const racing =
        known?.rotatedAt &&
        now.getTime() - known.rotatedAt.getTime() < OAUTH_REFRESH_REUSE_GRACE_MS
      if (known?.rotatedAt && !racing) {
        await this.revokeGrantTokens(known.grantId, now)
        this.logger.warn('OAuth refresh token reused: grant revoked')
      }
      throw invalid()
    }

    const [row] = await this.db
      .select({ grant: oauthGrantsTable, clientId: oauthClientsTable.clientId })
      .from(oauthGrantsTable)
      .innerJoin(
        oauthClientsTable,
        eq(oauthClientsTable.id, oauthGrantsTable.clientId),
      )
      .where(eq(oauthGrantsTable.id, spent.grantId))
      .limit(1)
    if (
      !row ||
      row.grant.revokedAt ||
      row.grant.expiresAt <= now ||
      row.clientId !== input.client_id
    ) {
      throw invalid()
    }
    const asked = (input.scope ?? '').split(' ').filter(Boolean)
    if (
      asked.some((scope) => scope !== 'read' && scope !== 'write') ||
      (asked.includes('write') && row.grant.scope !== 'write')
    ) {
      throw new OAuthError('invalid_scope', 'Scope beyond the approved one')
    }
    this.checkResource(input.resource, () => {
      throw new OAuthError('invalid_target', 'Unknown resource')
    })
    return this.db.transaction((tx) => this.issueTokens(tx, row.grant, now))
  }

  private async issueTokens(
    tx: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    grant: { id: string; scope: AccessTokenScope; expiresAt: Date },
    now: Date,
  ): Promise<OAuthTokenResponse> {
    const accessToken = secret(OAUTH_ACCESS_TOKEN_PREFIX)
    const refreshToken = secret(OAUTH_REFRESH_TOKEN_PREFIX)
    const accessExpiry = Math.min(
      now.getTime() + OAUTH_ACCESS_TOKEN_TTL_SECONDS * 1000,
      grant.expiresAt.getTime(),
    )
    await tx.insert(oauthTokensTable).values([
      {
        grantId: grant.id,
        kind: 'access',
        tokenHash: hashAccessToken(accessToken),
        expiresAt: new Date(accessExpiry),
        createdAt: now,
      },
      {
        grantId: grant.id,
        kind: 'refresh',
        tokenHash: hashAccessToken(refreshToken),
        expiresAt: new Date(
          Math.min(
            now.getTime() + OAUTH_REFRESH_TOKEN_TTL_MS,
            grant.expiresAt.getTime(),
          ),
        ),
        createdAt: now,
      },
    ])
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.max(
        1,
        Math.floor((accessExpiry - now.getTime()) / 1000),
      ),
      refresh_token: refreshToken,
      scope: scopeString(grant.scope),
    }
  }

  // --- Revocation -------------------------------------------------------------

  /**
   * RFC 7009: always succeeds. A refresh token ends its whole grant; an access
   * token only itself. Tokens of another client are left alone.
   */
  async revokeToken(body: unknown, now = new Date()): Promise<void> {
    const input =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const token = input['token']
    if (typeof token !== 'string') {
      throw new OAuthError('invalid_request', 'token is required')
    }
    if (
      !OAUTH_ACCESS_TOKEN_PATTERN.test(token) &&
      !OAUTH_REFRESH_TOKEN_PATTERN.test(token)
    ) {
      return
    }
    const [row] = await this.db
      .select({
        id: oauthTokensTable.id,
        kind: oauthTokensTable.kind,
        grantId: oauthTokensTable.grantId,
        clientId: oauthClientsTable.clientId,
      })
      .from(oauthTokensTable)
      .innerJoin(
        oauthGrantsTable,
        eq(oauthGrantsTable.id, oauthTokensTable.grantId),
      )
      .innerJoin(
        oauthClientsTable,
        eq(oauthClientsTable.id, oauthGrantsTable.clientId),
      )
      .where(eq(oauthTokensTable.tokenHash, hashAccessToken(token)))
      .limit(1)
    if (!row) return
    if (
      typeof input['client_id'] === 'string' &&
      input['client_id'] !== row.clientId
    ) {
      return
    }
    if (row.kind === 'refresh') {
      await this.revokeGrantTokens(row.grantId, now)
    } else {
      await this.db
        .update(oauthTokensTable)
        .set({ revokedAt: now })
        .where(
          and(
            eq(oauthTokensTable.id, row.id),
            isNull(oauthTokensTable.revokedAt),
          ),
        )
    }
  }

  /** Revokes a grant and every token it issued. */
  private async revokeGrantTokens(grantId: string, now: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(oauthGrantsTable)
        .set({ revokedAt: now })
        .where(
          and(
            eq(oauthGrantsTable.id, grantId),
            isNull(oauthGrantsTable.revokedAt),
          ),
        )
      await tx
        .update(oauthTokensTable)
        .set({ revokedAt: now })
        .where(
          and(
            eq(oauthTokensTable.grantId, grantId),
            isNull(oauthTokensTable.revokedAt),
          ),
        )
    })
  }

  // --- Resource server side ----------------------------------------------------

  /**
   * Resolves an OAuth access token presented to the API, or null when remote
   * access is off, or the token is malformed, unknown, expired, revoked, of a
   * revoked or expired grant, or issued for another resource.
   */
  async authenticate(
    token: string,
    now = new Date(),
  ): Promise<AuthenticatedOAuthToken | null> {
    if (!this.config.enabled || !OAUTH_ACCESS_TOKEN_PATTERN.test(token)) {
      return null
    }
    const [row] = await this.db
      .select({
        grantId: oauthGrantsTable.id,
        userId: oauthGrantsTable.userId,
        scope: oauthGrantsTable.scope,
        expiresAt: oauthTokensTable.expiresAt,
        lastUsedAt: oauthGrantsTable.lastUsedAt,
      })
      .from(oauthTokensTable)
      .innerJoin(
        oauthGrantsTable,
        eq(oauthGrantsTable.id, oauthTokensTable.grantId),
      )
      .where(
        and(
          eq(oauthTokensTable.tokenHash, hashAccessToken(token)),
          eq(oauthTokensTable.kind, 'access'),
          isNull(oauthTokensTable.revokedAt),
          gt(oauthTokensTable.expiresAt, now),
          isNull(oauthGrantsTable.revokedAt),
          gt(oauthGrantsTable.expiresAt, now),
          eq(oauthGrantsTable.resource, this.config.resource),
        ),
      )
      .limit(1)
    if (!row) return null
    if (
      !row.lastUsedAt ||
      now.getTime() - row.lastUsedAt.getTime() >= OAUTH_LAST_USED_RESOLUTION_MS
    ) {
      await this.db
        .update(oauthGrantsTable)
        .set({ lastUsedAt: now })
        .where(eq(oauthGrantsTable.id, row.grantId))
    }
    return {
      grantId: row.grantId,
      userId: row.userId,
      scope: row.scope,
      expiresAt: row.expiresAt,
    }
  }

  // --- Owner's view (profile page) --------------------------------------------

  async listGrants(userId: string, now = new Date()): Promise<OAuthGrantDto[]> {
    const rows = await this.db
      .select({ grant: oauthGrantsTable, client: oauthClientsTable })
      .from(oauthGrantsTable)
      .innerJoin(
        oauthClientsTable,
        eq(oauthClientsTable.id, oauthGrantsTable.clientId),
      )
      .where(
        and(
          eq(oauthGrantsTable.userId, userId),
          isNull(oauthGrantsTable.revokedAt),
          gt(oauthGrantsTable.expiresAt, now),
        ),
      )
      .orderBy(desc(oauthGrantsTable.createdAt))
    return rows.map(({ grant, client }) => ({
      id: grant.id,
      clientName: client.clientName,
      redirectHost: client.redirectUris[0]
        ? new URL(client.redirectUris[0]).host
        : '',
      scope: grant.scope,
      createdAt: grant.createdAt.toISOString(),
      lastUsedAt: grant.lastUsedAt?.toISOString() ?? null,
      expiresAt: grant.expiresAt.toISOString(),
    }))
  }

  async revokeGrant(
    userId: string,
    id: string,
    now = new Date(),
  ): Promise<void> {
    const [grant] = await this.db
      .select({ id: oauthGrantsTable.id })
      .from(oauthGrantsTable)
      .where(
        and(
          eq(oauthGrantsTable.id, id),
          eq(oauthGrantsTable.userId, userId),
          isNull(oauthGrantsTable.revokedAt),
        ),
      )
      .limit(1)
    if (!grant) throw new NotFoundException(OAUTH_ERRORS.GRANT_NOT_FOUND)
    await this.revokeGrantTokens(grant.id, now)
  }

  /** Appends an audit row; prunes old audit rows, codes and tokens now and then. */
  async recordUse(use: OAuthUse, now = new Date()): Promise<void> {
    await this.db.insert(oauthAuditTable).values({ ...use, createdAt: now })
    if (now.getTime() - this.lastPruneAt < OAUTH_PRUNE_INTERVAL_MS) return
    this.lastPruneAt = now.getTime()
    const auditCutoff = new Date(
      now.getTime() - OAUTH_AUDIT_RETENTION_DAYS * DAY_MS,
    )
    const expiredCutoff = new Date(now.getTime() - DAY_MS)
    try {
      await this.db
        .delete(oauthAuditTable)
        .where(lt(oauthAuditTable.createdAt, auditCutoff))
      await this.db
        .delete(oauthAuthorizationCodesTable)
        .where(lt(oauthAuthorizationCodesTable.expiresAt, expiredCutoff))
      await this.db
        .delete(oauthTokensTable)
        .where(
          or(
            lt(oauthTokensTable.expiresAt, expiredCutoff),
            lt(oauthTokensTable.revokedAt, expiredCutoff),
          ),
        )
    } catch (error) {
      this.logger.warn(
        `Pruning OAuth rows failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      )
    }
  }

  async audit(userId: string, limit: number): Promise<OAuthAuditEntryDto[]> {
    const rows = await this.db
      .select({
        id: oauthAuditTable.id,
        grantId: oauthAuditTable.grantId,
        clientName: oauthClientsTable.clientName,
        method: oauthAuditTable.method,
        route: oauthAuditTable.route,
        statusCode: oauthAuditTable.statusCode,
        createdAt: oauthAuditTable.createdAt,
      })
      .from(oauthAuditTable)
      .innerJoin(
        oauthGrantsTable,
        eq(oauthGrantsTable.id, oauthAuditTable.grantId),
      )
      .innerJoin(
        oauthClientsTable,
        eq(oauthClientsTable.id, oauthGrantsTable.clientId),
      )
      .where(eq(oauthGrantsTable.userId, userId))
      .orderBy(desc(oauthAuditTable.createdAt), desc(oauthAuditTable.id))
      .limit(limit)
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }))
  }
}
