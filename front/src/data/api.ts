/* Client de l'API Go, servie derrière le proxy Vite /api.
   Les jetons voyagent en cookies HttpOnly : ce module ne les voit jamais, il se contente
   de relancer le refresh quand l'access token a expiré. */

export class ApiError extends Error
{
	status:	number
	key:	string

	constructor(status: number, key: string)
	{
		super(key)
		this.status	= status
		this.key	= key
	}
}

const API_BASE			= '/api'
const NO_REFRESH_PATHS	= ['/auth/login', '/auth/signup', '/auth/refresh', '/auth/logout']

let refreshing: Promise<boolean> | null = null

/* Un seul refresh à la fois : des requêtes expirées ensemble attendent le même, sinon
   la rotation du premier invaliderait le jeton envoyé par les suivants. */
function refreshSession(): Promise<boolean>
{
	refreshing ??= fetch(`${API_BASE}/auth/refresh`, { method: 'POST' })
		.then((response) => response.ok)
		.catch(() => false)
		.finally(() => (refreshing = null))
	return refreshing
}

export async function api<T>(method: string, path: string, body?: unknown, retry: boolean = true): Promise<T>
{
	let response: Response
	try
	{
		response = await fetch(`${API_BASE}${path}`, {
			method,
			headers:	body === undefined ? undefined : { 'Content-Type': 'application/json' },
			body:		body === undefined ? undefined : JSON.stringify(body),
			/* Une écriture partie au moment où l'onglet se ferme va quand même au bout. */
			keepalive:	method !== 'GET'
		})
	}
	catch
	{
		throw new ApiError(0, 'errors.network')
	}

	if (response.status === 401 && retry && !NO_REFRESH_PATHS.includes(path) && (await refreshSession()))
		return api<T>(method, path, body, false)

	if (!response.ok)
	{
		const payload = await response.json().catch(() => null)
		throw new ApiError(response.status, payload?.error?.key ?? 'errors.common.unknown')
	}

	if (response.status === 204) return undefined as T
	return (await response.json()) as T
}
