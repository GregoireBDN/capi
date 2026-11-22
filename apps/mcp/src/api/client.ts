/**
 * Minimal client for the Capi API. Every request carries the
 * personal access token as `Authorization: Bearer`; nothing here touches the
 * database. Errors become `ApiError`s with a French message the tool returns to
 * the model. Never log responses, query strings or bodies: they hold amounts,
 * labels and searches.
 */

export type QueryValue = string | number | boolean | null | undefined
export type Query = Record<string, QueryValue>
export type WriteMethod = 'POST' | 'PATCH' | 'PUT'

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the API could not be reached. */
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClientOptions {
  baseUrl: string
  token: string
  fetch?: typeof fetch
  timeoutMs?: number
  /**
   * `stdio` (default): a personal access token from the environment.
   * `http`: the OAuth access token of a remote connection (#78); the error
   * messages then talk about the connector instead of FINANCES_API_TOKEN.
   */
  mode?: 'stdio' | 'http'
  /** Remote transport: the client IP, sent as `X-Forwarded-For` for the API's rate limits. */
  forwardedFor?: string
}

const DEFAULT_TIMEOUT_MS = 20_000

export class ApiClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly mode: 'stdio' | 'http'
  private readonly forwardedFor: string | undefined

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.fetchImpl = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.mode = options.mode ?? 'stdio'
    this.forwardedFor = options.forwardedFor
  }

  /** GET `path` (starting with `/api/`) with the query parameters that are set. */
  get<T>(path: string, query: Query = {}): Promise<T> {
    return this.request<T>('GET', path, query)
  }

  /**
   * POST / PATCH / PUT a JSON body. Only the write tools call this, after the
   * owner confirmed the preview; a `read` token gets a 403.
   */
  send<T>(
    method: WriteMethod,
    path: string,
    body: unknown,
    query: Query = {},
  ): Promise<T> {
    return this.request<T>(method, path, query, body)
  }

  /**
   * POST a multipart form (a bank export for the import preview, #103). The
   * file is sent as is and never logged.
   */
  upload<T>(path: string, form: FormData): Promise<T> {
    return this.request<T>('POST', path, {}, form)
  }

  private async request<T>(
    method: 'GET' | WriteMethod,
    path: string,
    query: Query,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    }
    if (this.forwardedFor) headers['X-Forwarded-For'] = this.forwardedFor
    const multipart = body instanceof FormData
    // fetch sets the multipart Content-Type with its boundary.
    if (body !== undefined && !multipart)
      headers['Content-Type'] = 'application/json'
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: multipart
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ApiError(
          0,
          method === 'GET'
            ? "L'API n'a pas répondu à temps. Réessayez dans un instant."
            : "L'API n'a pas répondu à temps : la modification a pu être appliquée ou non. Vérifiez avant de réessayer (les outils d'écriture ne refont rien qui soit déjà fait).",
        )
      }
      throw new ApiError(
        0,
        this.mode === 'http'
          ? 'API injoignable depuis le serveur MCP. Réessayez dans un instant.'
          : `API injoignable (${new URL(this.baseUrl).origin}) : vérifiez FINANCES_API_URL et que l'application tourne.`,
      )
    }
    if (!response.ok) {
      throw new ApiError(
        response.status,
        await errorMessage(response, method, this.mode),
      )
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}

async function errorMessage(
  response: Response,
  method: 'GET' | WriteMethod,
  mode: 'stdio' | 'http',
): Promise<string> {
  if (mode === 'http' && response.status === 401) {
    return "Connexion refusée par l'API (expirée ou déconnectée depuis le profil). Reconnectez le connecteur Capi dans Claude."
  }
  if (mode === 'http' && response.status === 403) {
    return method === 'GET'
      ? "Accès refusé : cette donnée n'est pas accessible à un connecteur."
      : "Modification refusée : le connecteur a été autorisé en lecture seule (ou cette action reste réservée à l'application). Pour les modifications, déconnectez-le depuis le profil et reconnectez-le en cochant « Autoriser les modifications ». Rien n'a été modifié."
  }
  switch (response.status) {
    case 401:
      return "Token refusé par l'API (invalide, expiré ou révoqué). Créez un token sur la page Profil de l'application (portée « Lecture seule », ou « Lecture et écriture » pour les modifications) et mettez à jour FINANCES_API_TOKEN."
    case 403:
      return method === 'GET'
        ? "Accès refusé pour ce token : cette donnée n'est pas accessible avec un token."
        : "Modification refusée : le token configuré est en lecture seule. Pour les outils d'écriture, créez un token de portée « Lecture et écriture » sur la page Profil et mettez à jour FINANCES_API_TOKEN. Rien n'a été modifié."
    case 404:
      return "Introuvable : l'élément demandé n'existe pas (ou plus)."
    case 409:
      return `Conflit : ${await validationMessage(response, "l'état a changé depuis l'aperçu")}. Rien n'a été modifié : refaites un aperçu.`
    case 429: {
      const retryAfter = Number(response.headers.get('retry-after'))
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? `dans ${Math.ceil(retryAfter)} s`
          : 'dans une minute'
      return `Trop de requêtes : la limite de l'API est atteinte. Réessayez ${wait}.`
    }
    case 400:
      return `Paramètres refusés par l'API : ${await validationMessage(response, 'requête invalide.')}`
    default:
      return response.status >= 500
        ? `L'API a renvoyé une erreur (${response.status}). Réessayez plus tard.`
        : `L'API a refusé la requête (${response.status}).`
  }
}

/** Nest's validation message (`message`: string or list of strings). */
async function validationMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown }
    const message = Array.isArray(body.message)
      ? body.message.join(' ; ')
      : body.message
    if (typeof message === 'string' && message) return message.slice(0, 500)
  } catch {
    // Not JSON: fall through.
  }
  return fallback
}
