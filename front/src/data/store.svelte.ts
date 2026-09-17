import { goto }				from '$app/navigation'
import { resolve }			from '$app/paths'
import { api, ApiError }	from './api'
import { errorMessage }		from './errors'
import { indexTitres, setTitres }	from './invest'
import type { action, backupTables, depense, depenseGroup, marche, mouvement, profilInvest, titre, user } from './types'

/* État de l'app, en mémoire, synchronisé avec l'API.
   Chaque modification est appliquée localement tout de suite (l'interface ne attend
   jamais le réseau), puis envoyée. En cas d'échec, l'état est rechargé depuis l'API,
   qui fait foi. */

const EDIT_DELAY = 400

export const db: backupTables = $state(emptyTables())

export const session: { user: user | null; checked: boolean } = $state({ user: null, checked: false })

export const sync: { error: string | null } = $state({ error: null })

interface pendingEdit
{
	timer:	ReturnType<typeof setTimeout>;
	run:	() => unknown;
}

const pending: Record<string, pendingEdit> = {}

function emptyTables(): backupTables
{
	return {
		PROFIL_INVEST:	[],
		DEPENSE_GROUP:	[],
		REVENU:			[],
		BANNED:			[],
		ACTION:			[],
		DEPENSE:		[],
		VERSEMENT_DIV:	[],
		MOUVEMENT:		[],
		MARCHE:			[],
		TITRE:			[]
	}
}

function replaceTables(tables: Partial<backupTables>): void
{
	db.PROFIL_INVEST	= tables.PROFIL_INVEST ?? []
	db.DEPENSE_GROUP	= tables.DEPENSE_GROUP ?? []
	db.REVENU			= tables.REVENU ?? []
	db.BANNED			= tables.BANNED ?? []
	db.ACTION			= tables.ACTION ?? []
	db.DEPENSE			= tables.DEPENSE ?? []
	db.VERSEMENT_DIV	= tables.VERSEMENT_DIV ?? []
	db.MOUVEMENT		= tables.MOUVEMENT ?? []
	db.MARCHE			= tables.MARCHE ?? []
	db.TITRE			= tables.TITRE ?? []
	setTitres(indexTitres(db.TITRE))
}

export async function loadData(): Promise<void>
{
	const snapshot = await api<{ tables: Partial<backupTables> }>('GET', '/data')
	replaceTables(snapshot.tables)
}

/* Vérifie la session une seule fois par chargement de l'app ; l'access token expiré est
   renouvelé en chemin par le client API. */
export async function ensureSession(): Promise<boolean>
{
	if (session.checked) return session.user !== null

	try
	{
		session.user = await api<user>('GET', '/auth/me')
		await loadData()
	}
	catch (error)
	{
		if (!(error instanceof ApiError) || error.status !== 401) sync.error = errorMessage(error)
		session.user = null
	}

	session.checked = true
	return session.user !== null
}

export async function authenticate(mode: 'login' | 'signup', pseudo: string, password: string, passwordConfirm: string = ''): Promise<void>
{
	const body			= mode === 'signup' ? { pseudo, password, password_confirm: passwordConfirm } : { pseudo, password }
	const authenticated	= await api<user>('POST', `/auth/${mode}`, body)
	session.user		= authenticated
	session.checked		= true
	await loadData()
}

export async function signOut(): Promise<void>
{
	flushEdits()
	try
	{
		await api('POST', '/auth/logout')
	}
	finally
	{
		endSession()
	}
}

function endSession(): void
{
	session.user = null
	replaceTables(emptyTables())
	void goto(resolve('/connexion'))
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T | undefined>
{
	try
	{
		return await api<T>(method, path, body)
	}
	catch (error)
	{
		if (error instanceof ApiError && error.status === 401)
		{
			endSession()
			return undefined
		}

		sync.error = errorMessage(error)
		loadData().catch(() => undefined)
		return undefined
	}
}

/* Regroupe les frappes : seule la dernière valeur d'une clé part, EDIT_DELAY ms après. */
function debounce(key: string, run: () => unknown): void
{
	const existing = pending[key]
	if (existing) clearTimeout(existing.timer)

	const timer = setTimeout(() =>
	{
		delete pending[key]
		run()
	}, EDIT_DELAY)
	pending[key] = { timer, run }
}

function cancelEdits(prefix: string): void
{
	for (const key in pending)
	{
		if (!key.startsWith(prefix)) continue

		clearTimeout(pending[key].timer)
		delete pending[key]
	}
}

/* Envoie immédiatement les modifications en attente (déconnexion, fermeture d'onglet). */
export function flushEdits(): void
{
	for (const key in pending)
	{
		const edit = pending[key]
		clearTimeout(edit.timer)
		delete pending[key]
		edit.run()
	}
}

/* Crée une ligne côté serveur, puis l'ajoute localement avec l'id attribué. */
export async function create<K extends keyof backupTables>(
	table: K, resource: string, body: Record<string, unknown>
): Promise<backupTables[K][number] | undefined>
{
	const row = await send<backupTables[K][number]>('POST', resource, body)
	if (row) (db[table] as unknown as backupTables[K][number][]).push(row)
	return row
}

/* Modifie un champ localement, puis l'envoie une fois la saisie posée. */
export function edit<T extends object, K extends keyof T & string>(
	row: T, field: K, value: T[K], resource: string, id: number
): void
{
	row[field] = value
	debounce(`${resource}/${id}/${field}`, () => send('PATCH', `${resource}/${id}`, { [field]: value }))
}

/* Supprime localement puis côté serveur. Les suppressions en cascade restent à la charge
   de l'appelant pour l'état local ; le serveur les applique de lui-même. */
export function remove<T>(rows: T[], match: (row: T) => boolean, resource: string, id: number): void
{
	cancelEdits(`${resource}/${id}/`)
	removeWhere(rows, match)
	void send('DELETE', `${resource}/${id}`)
}

/* Bascule un mois de versement d'un titre (commun). L'envoi est différé et lit l'état au
   moment de partir : deux clics rapides sur le même mois n'envoient qu'une requête. */
export function toggleVersement(idTitre: number, month: number): void
{
	const before = db.VERSEMENT_DIV.length
	removeWhere(db.VERSEMENT_DIV, (row) => row.id_titre === idTitre && row.mois === month)
	if (db.VERSEMENT_DIV.length === before) db.VERSEMENT_DIV.push({ id_titre: idTitre, mois: month })

	debounce(`/titres/${idTitre}/versements/${month}`, () =>
	{
		let paid = false
		for (const row of db.VERSEMENT_DIV)
			if (row.id_titre === idTitre && row.mois === month) paid = true
		return send(paid ? 'PUT' : 'DELETE', `/titres/${idTitre}/versements/${month}`)
	})
}

export function setVersements(idTitre: number, months: number[]): void
{
	cancelEdits(`/titres/${idTitre}/versements/`)
	removeWhere(db.VERSEMENT_DIV, (row) => row.id_titre === idTitre)
	for (const month of months)
		db.VERSEMENT_DIV.push({ id_titre: idTitre, mois: month })

	debounce(`/titres/${idTitre}/versements`, () => send('PUT', `/titres/${idTitre}/versements`, { mois: months }))
}

/* ── Catalogue commun ──────────────────────────────────────────────────────
   Le prix et le dividende d'un titre sont partagés : les modifier les modifie pour tous
   (bloqué : prix personnel, appliqué par le serveur). Réponse = titre tel que vu par
   l'utilisateur, reportée dans db.TITRE. */

export function findTitre(idTitre: number): titre | null
{
	for (const row of db.TITRE)
		if (row.id_titre === idTitre) return row
	return null
}

function applyTitre(saved: titre): void
{
	const row = findTitre(saved.id_titre)
	if (row) Object.assign(row, saved)
	else db.TITRE.push(saved)
	setTitres(indexTitres(db.TITRE))
}

export async function createTitre(nom: string, idMarche: number, prix: number | null): Promise<titre | undefined>
{
	const saved = await send<titre>('POST', '/titres', { nom, id_marche: idMarche, prix, div: null })
	if (saved) applyTitre(saved)
	return saved
}

export async function createMarche(label: string): Promise<marche | undefined>
{
	const saved = await send<marche>('POST', '/marches', { label })
	if (saved) db.MARCHE.push(saved)
	return saved
}

export function editTitre(row: titre, field: 'prix' | 'div', value: number | null): void
{
	row[field] = value
	debounce(`/titres/${row.id_titre}/${field}`, async () =>
	{
		const saved = await send<titre>('PATCH', `/titres/${row.id_titre}`, { [field]: value, [`set_${field}`]: true })
		if (saved) applyTitre(saved)
	})
}

/* ── Positions ─────────────────────────────────────────────────────────────
   Ajoute un titre à une enveloppe. Si la position existe déjà (archivée ou à 0 part),
   elle est remise en service : UNIQUE (enveloppe, titre) interdit le doublon. */
export async function addPosition(idProfil: number, idTitre: number): Promise<action | undefined>
{
	for (const row of db.ACTION)
	{
		if (row.id_profil_inv !== idProfil || row.id_titre !== idTitre) continue
		if (row.archive_le !== null) edit(row, 'archive_le', null, '/actions', row.id_action)
		return row
	}
	return create('ACTION', '/actions', { id_profil_inv: idProfil, id_titre: idTitre, nb_part_acquis: null, prix_inv: null, nb_inv: null })
}

/* Archive localement puis côté serveur (DELETE = archivage pour ces ressources). */
export function archive<T extends { archive_le: string | null }>(row: T, resource: string, id: number): void
{
	cancelEdits(`${resource}/${id}/`)
	row.archive_le = new Date().toISOString().slice(0, 10)
	void send('DELETE', `${resource}/${id}`)
}

/* Dépenses et sections : `ordre` numérote chaque liste 0..n-1 (dépenses d'une section,
   sections de l'utilisateur). Le serveur applique les mêmes décalages dans une transaction ;
   la création n'envoie pas `ordre`, le serveur place la ligne en fin de liste. */

/* Supprime une dépense et referme le trou dans sa section. */
export function removeDepense(row: depense): void
{
	const { id_depense: id, id_depense_group: idGroup, ordre } = row
	remove(db.DEPENSE, (other) => other.id_depense === id, '/depenses', id)
	for (const other of db.DEPENSE)
		if (other.id_depense_group === idGroup && other.ordre > ordre) other.ordre--
}

/* ON DELETE CASCADE côté serveur : la cascade est reproduite sur l'état local. */
export function removeDepenseGroup(group: depenseGroup): void
{
	const { id_depense_group: id, ordre } = group
	removeWhere(db.DEPENSE, (row) => row.id_depense_group === id)
	remove(db.DEPENSE_GROUP, (row) => row.id_depense_group === id, '/depense-groups', id)
	for (const other of db.DEPENSE_GROUP)
		if (other.ordre > ordre) other.ordre--
}

/* Place une dépense à `ordre` dans la section `idGroup`, qui peut être la sienne.
   `ordre` va de 0 au nombre de dépenses de la section cible, dépense déplacée exclue. */
export function moveDepense(row: depense, idGroup: number, ordre: number): void
{
	const { id_depense: id, id_depense_group: fromGroup, ordre: fromOrdre } = row
	if (fromGroup === idGroup && fromOrdre === ordre) return

	for (const other of db.DEPENSE)
	{
		if (other.id_depense === id) continue
		if (other.id_depense_group === fromGroup && other.ordre > fromOrdre) other.ordre--
		if (other.id_depense_group === idGroup && other.ordre >= ordre) other.ordre++
	}
	row.id_depense_group	= idGroup
	row.ordre				= ordre

	void send('PATCH', `/depenses/${id}/move`, { id_depense_group: idGroup, ordre })
}

export function moveDepenseGroup(group: depenseGroup, ordre: number): void
{
	const { id_depense_group: id, ordre: fromOrdre } = group
	if (fromOrdre === ordre) return

	for (const other of db.DEPENSE_GROUP)
	{
		if (other.id_depense_group === id) continue
		if (other.ordre > fromOrdre) other.ordre--
		if (other.ordre >= ordre) other.ordre++
	}
	group.ordre = ordre

	void send('PATCH', `/depense-groups/${id}/move`, { ordre })
}

/* Mouvements : le serveur reporte les parts sur ACTION.nb_part_acquis et renvoie la valeur
   à jour, appliquée telle quelle. Aucun calcul local des parts : l'API fait foi. */

interface actionParts
{
	id_action:		number;
	nb_part_acquis:	number;
	archive_le:		string | null;
}

export type mouvementDraft = Omit<mouvement, 'id_mouvement'>

function applyParts(parts: actionParts): void
{
	for (const row of db.ACTION)
	{
		if (row.id_action !== parts.id_action) continue
		row.nb_part_acquis	= parts.nb_part_acquis
		row.archive_le		= parts.archive_le
	}
}

/* Valide plusieurs mouvements d'un coup : tout passe ou rien. Renvoie false en cas d'échec. */
export async function createMouvements(drafts: mouvementDraft[]): Promise<boolean>
{
	const saved = await send<{ ids: number[]; actions: actionParts[] }>('POST', '/mouvements', { mouvements: drafts })
	if (!saved) return false

	drafts.forEach((draft, index) => db.MOUVEMENT.push({ id_mouvement: saved.ids[index], ...draft }))
	for (const parts of saved.actions) applyParts(parts)
	return true
}

/* Modifie un champ localement, puis envoie la ligne complète une fois la saisie posée. */
export function editMouvement<K extends 'date' | 'nb_part' | 'prix'>(row: mouvement, field: K, value: mouvement[K]): void
{
	row[field] = value
	debounce(`/mouvements/${row.id_mouvement}`, async () =>
	{
		const parts = await send<actionParts>('PUT', `/mouvements/${row.id_mouvement}`, {
			date:		row.date,
			nb_part:	row.nb_part,
			prix:		row.prix
		})
		if (parts) applyParts(parts)
	})
}

export async function removeMouvement(row: mouvement): Promise<void>
{
	const id = row.id_mouvement
	cancelEdits(`/mouvements/${id}`)
	removeWhere(db.MOUVEMENT, (other) => other.id_mouvement === id)

	const parts = await send<actionParts>('DELETE', `/mouvements/${id}`)
	if (parts) applyParts(parts)
}

/* Copie triée par `ordre`, sans toucher à la table source. */
export function byOrdre<T extends { ordre: number | null }>(rows: T[]): T[]
{
	return [...rows].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
}

/* Supprime en place les lignes qui vérifient `match`. Parcours à rebours :
   un splice ne décale ainsi que les lignes déjà traitées. */
export function removeWhere<T>(rows: T[], match: (row: T) => boolean): void
{
	for (let i = rows.length - 1; i >= 0; i--)
		if (match(rows[i])) rows.splice(i, 1)
}

export function nextOrdre<T extends { ordre: number | null }>(rows: T[]): number
{
	let max = -1
	for (const row of rows)
		if ((row.ordre ?? -1) > max) max = row.ordre ?? -1
	return max + 1
}
