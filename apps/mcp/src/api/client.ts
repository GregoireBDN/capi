/**
 * Minimal read-only client for the Finances API. Every request carries the
 * personal access token as `Authorization: Bearer`; nothing here touches the
 * database. Errors become `ApiError`s with a French message the tool returns to
 * the model. Never log responses, query strings or bodies: they hold amounts,
 * labels and searches.
 */

export type QueryValue = string | number | boolean | null | undefined
export type Query = Record<string, QueryValue>

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
}

const DEFAULT_TIMEOUT_MS = 20_000

export class ApiClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.fetchImpl = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** GET `path` (starting with `/api/`) with the query parameters that are set. */
  async get<T>(path: string, query: Query = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ApiError(
          0,
          "L'API n'a pas répondu à temps. Réessayez dans un instant.",
        )
      }
      throw new ApiError(
        0,
        `API injoignable (${new URL(this.baseUrl).origin}) : vérifiez FINANCES_API_URL et que l'application tourne.`,
      )
    }
    if (!response.ok) {
      throw new ApiError(response.status, await errorMessage(response))
    }
    return (await response.json()) as T
  }
}

async function errorMessage(response: Response): Promise<string> {
  switch (response.status) {
    case 401:
      return "Token refusé par l'API (invalide, expiré ou révoqué). Créez un token de portée « lecture » sur la page Profil de l'application et mettez à jour FINANCES_API_TOKEN."
    case 403:
      return "Accès refusé pour ce token : le serveur MCP n'a besoin que d'un token de portée « lecture », et cette donnée n'est pas accessible avec un token."
    case 404:
      return "Introuvable : l'élément demandé n'existe pas (ou plus)."
    case 429: {
      const retryAfter = Number(response.headers.get('retry-after'))
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? `dans ${Math.ceil(retryAfter)} s`
          : 'dans une minute'
      return `Trop de requêtes : la limite de l'API est atteinte. Réessayez ${wait}.`
    }
    case 400:
      return `Paramètres refusés par l'API : ${await validationMessage(response)}`
    default:
      return response.status >= 500
        ? `L'API a renvoyé une erreur (${response.status}). Réessayez plus tard.`
        : `L'API a refusé la requête (${response.status}).`
  }
}

/** Nest's validation message (`message`: string or list of strings). */
async function validationMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown }
    const message = Array.isArray(body.message)
      ? body.message.join(' ; ')
      : body.message
    if (typeof message === 'string' && message) return message.slice(0, 500)
  } catch {
    // Not JSON: fall through.
  }
  return 'requête invalide.'
}
