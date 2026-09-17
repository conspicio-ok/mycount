import { redirect }			from '@sveltejs/kit'
import { resolve }			from '$app/paths'
import { ensureSession }	from '$data/store.svelte'
import type { LayoutLoad }	from './$types'

export const ssr = false

/* Garde d'authentification, exécutée dans le navigateur avant chaque page :
   sans session, tout mène à /connexion ; avec, /connexion renvoie à l'accueil. */
export const load: LayoutLoad = async ({ url }) =>
{
	const authenticated	= await ensureSession()
	const onLogin		= url.pathname === resolve('/connexion')

	if (!authenticated && !onLogin) redirect(307, resolve('/connexion'))
	if (authenticated && onLogin) redirect(307, resolve('/'))
}
