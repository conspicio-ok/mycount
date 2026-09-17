<script lang="ts">
	import Section				from '$lib/layout/Section.svelte'
	import Tile					from '$lib/patterns/Tile.svelte'
	import ValueRow				from '$lib/patterns/ValueRow.svelte'
	import AmountInput			from '$lib/forms/AmountInput.svelte'
	import { formatAmount }		from '$lib/format'
	import { labelOf, montantOf }	from '$data/invest'
	import { db, editMouvement, removeMouvement, session, signOut }	from '$data/store.svelte'
	import { api }				from '$data/api'
	import { errorMessage }		from '$data/errors'
	import type { role }		from '$data/types'

	interface account
	{
		id_utilisateur:	number;
		pseudo:			string;
		role:			role;
	}

	let accounts: account[]	= $state([])
	let adminError			= $state('')

	/* Admin seulement : la liste vient d'une route dédiée, hors instantané. */
	$effect(() =>
	{
		if (session.user?.role !== 'admin') return
		api<account[]>('GET', '/admin/users').then((rows) => (accounts = rows)).catch(() => (adminError = 'Liste indisponible.'))
	})

	async function setRole(row: account, value: role): Promise<void>
	{
		try
		{
			const saved = await api<account>('PATCH', `/admin/users/${row.id_utilisateur}`, { role: value })
			row.role = saved.role
		}
		catch { adminError = 'Changement refusé.' }
	}

	/* Suppression = archivage côté serveur : plus de connexion, données conservées. */
	async function archiveAccount(row: account): Promise<void>
	{
		if (!confirm(`Supprimer le compte ${row.pseudo} ?`)) return

		adminError = ''
		try
		{
			await api('DELETE', `/admin/users/${row.id_utilisateur}`)
			const index = accounts.indexOf(row)
			if (index !== -1) accounts.splice(index, 1)
		}
		catch (error) { adminError = errorMessage(error) }
	}

	/* Création de compte par un admin : seule voie d'inscription après le premier compte. */
	let newPseudo			= $state('')
	let newPassword			= $state('')
	let newPasswordConfirm	= $state('')
	let creating			= $state(false)

	async function createAccount(event: SubmitEvent): Promise<void>
	{
		event.preventDefault()
		if (creating) return

		creating	= true
		adminError	= ''
		try
		{
			const saved = await api<account>('POST', '/admin/users', {
				pseudo:				newPseudo.trim(),
				password:			newPassword,
				password_confirm:	newPasswordConfirm
			})
			accounts.push(saved)
			newPseudo			= ''
			newPassword			= ''
			newPasswordConfirm	= ''
		}
		catch (error) { adminError = errorMessage(error) }
		finally { creating = false }
	}

	/* Changement de mot de passe : le serveur révoque les autres sessions. */
	let currentPassword		= $state('')
	let password			= $state('')
	let passwordConfirm		= $state('')
	let passwordMessage		= $state('')
	let changing			= $state(false)

	async function changePassword(event: SubmitEvent): Promise<void>
	{
		event.preventDefault()
		if (changing) return

		changing		= true
		passwordMessage	= ''
		try
		{
			await api('PUT', '/auth/password', {
				current_password:	currentPassword,
				password,
				password_confirm:	passwordConfirm
			})
			currentPassword	= ''
			password		= ''
			passwordConfirm	= ''
			passwordMessage	= 'Mot de passe modifié.'
		}
		catch (error) { passwordMessage = errorMessage(error) }
		finally { changing = false }
	}

	let signingOut = $state(false)

	/* Tout le journal, du plus récent au plus ancien. */
	const rows = $derived([...db.MOUVEMENT].sort((a, b) => b.date.localeCompare(a.date) || b.id_mouvement - a.id_mouvement))

	function positionLabel(idAction: number): string
	{
		for (const row of db.ACTION)
			if (row.id_action === idAction) return labelOf(row)
		return ''
	}

	async function logout(): Promise<void>
	{
		if (signingOut) return

		signingOut = true
		await signOut()
	}
</script>

<svelte:head><title>Compte — mycount</title></svelte:head>

<section class="hero">
	<h1>Compte</h1>
</section>

<Section title="Session">
	<Tile>
		<ValueRow label="Pseudo" value={session.user?.pseudo ?? ''} />

		<form class="form" onsubmit={changePassword}>
			<input class="input" type="password" placeholder="Mot de passe actuel" aria-label="Mot de passe actuel" autocomplete="current-password" required bind:value={currentPassword} />
			<input class="input" type="password" placeholder="Nouveau mot de passe" aria-label="Nouveau mot de passe" autocomplete="new-password" minlength="8" required bind:value={password} />
			<input class="input" type="password" placeholder="Confirmer" aria-label="Confirmer le nouveau mot de passe" autocomplete="new-password" required bind:value={passwordConfirm} />
			<button class="btn" type="submit" disabled={changing}>Changer</button>
		</form>
		{#if passwordMessage}<p>{passwordMessage}</p>{/if}

		<div class="actions">
			<button class="btn" type="button" disabled={signingOut} onclick={logout}>Se déconnecter</button>
		</div>
	</Tile>
</Section>

{#if session.user?.role === 'admin'}
	<!-- Rôles : user, admin, bloque (prix personnels, pas d'écriture du catalogue commun). -->
	<Section title="Administration">
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>Users</th>
						<th>Bloqué</th>
						<th>Admin</th>
						<th><span class="visually-hidden">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each accounts as row (row.id_utilisateur)}
						{@const self = row.id_utilisateur === session.user.id}
						<tr>
							<td>{row.pseudo}</td>
							<!-- Une case cochée pose le rôle, décochée revient à user : admin et bloqué s'excluent. -->
							<td><input type="checkbox" aria-label="Bloquer {row.pseudo}" disabled={self} checked={row.role === 'bloque'} onchange={(event) => setRole(row, event.currentTarget.checked ? 'bloque' : 'user')} /></td>
							<td><input type="checkbox" aria-label="Admin {row.pseudo}" disabled={self} checked={row.role === 'admin'} onchange={(event) => setRole(row, event.currentTarget.checked ? 'admin' : 'user')} /></td>
							<td><button class="btn danger" type="button" aria-label="Supprimer le compte {row.pseudo}" disabled={self} onclick={() => archiveAccount(row)}>×</button></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<form class="form" onsubmit={createAccount}>
			<input class="input" type="text" placeholder="Pseudo" aria-label="Pseudo du nouveau compte" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="32" required bind:value={newPseudo} />
			<input class="input" type="password" placeholder="Mot de passe" aria-label="Mot de passe du nouveau compte" autocomplete="new-password" minlength="8" required bind:value={newPassword} />
			<input class="input" type="password" placeholder="Confirmer" aria-label="Confirmer le mot de passe" autocomplete="new-password" required bind:value={newPasswordConfirm} />
			<button class="btn" type="submit" disabled={creating}>Créer un compte</button>
		</form>
		{#if adminError}<p class="error">{adminError}</p>{/if}
	</Section>
{/if}

<!-- Historique complet, borné en hauteur : c'est le tableau qui défile, pas la page. Export à venir. -->
<Section title="Historique des mouvements" id="historique">
	<div class="history">
		<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Date</th>
					<th>Position</th>
					<th>Sens</th>
					<th>Parts</th>
					<th>Prix</th>
					<th>Montant</th>
					<th><span class="visually-hidden">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id_mouvement)}
					<tr>
						<td>
							<input class="input" type="date" aria-label="Date" bind:value={() => row.date, (value) => { if (value) editMouvement(row, 'date', value) }} />
						</td>
						<td>{positionLabel(row.id_action)}</td>
						<td>{row.sens === 'achat' ? 'Achat' : 'Vente'}</td>
						<td>
							<AmountInput label="Parts" unit="parts" bind:value={() => row.nb_part, (value) => { if (value) editMouvement(row, 'nb_part', value) }} />
						</td>
						<td>
							<AmountInput label="Prix" bind:value={() => row.prix, (value) => editMouvement(row, 'prix', value ?? null)} />
						</td>
						<td>{formatAmount(montantOf(row))}</td>
						<td>
							<button class="btn danger" type="button" aria-label="Supprimer le mouvement" onclick={() => removeMouvement(row)}>×</button>
						</td>
					</tr>
				{:else}
					<tr><td class="empty" colspan="7">Aucun mouvement</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	</div>
</Section>

<style>
	.actions {
		justify-content: flex-end;
	}

	/* Une ligne : champs à parts égales, bouton au bout ; repli à la ligne sur petit écran. */
	.form {
		display:		flex;
		flex-wrap:		wrap;
		align-items:	baseline;
		gap:			var(--space-4);
		margin-top:		var(--space-6);
	}

	.form > .input {
		flex:	1 1 12ch;
		width:	auto;
	}

	.history {
		max-height:	60vh;
		overflow-y:	auto;
	}
</style>
