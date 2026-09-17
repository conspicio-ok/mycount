<script lang="ts">
	import Section		from '$lib/layout/Section.svelte'
	import Tile			from '$lib/patterns/Tile.svelte'
	import TileGrid		from '$lib/patterns/TileGrid.svelte'
	import StatTile		from '$lib/patterns/StatTile.svelte'
	import ValueRow		from '$lib/patterns/ValueRow.svelte'
	import ChipGroup	from '$lib/patterns/ChipGroup.svelte'
	import AmountInput	from '$lib/forms/AmountInput.svelte'
	import TitrePicker	from '$lib/forms/TitrePicker.svelte'
	import { page }							from '$app/state'
	import { formatAmount, displayColor }		from '$lib/format'
	import { roundMoney }					from '$data/money'
	import { MONTH_LABELS_SHORT }			from '$data/date'
	import type { action, profilInvest, titre }	from '$data/types'
	import {
		db, session, archive, byOrdre, create, createTitre, edit, editTitre, addPosition as addPositionToEnvelope,
		findTitre, remove, setVersements, toggleVersement
	} from '$data/store.svelte'
	import {
		computeRendAn, computeRendNet, divOf, envelopeInvestMensuel, envelopeTauxGlobal,
		indexMonths, investMensuelTotal, isActive, labelOf, monthsOf, positionsOf, prixOf
	} from '$data/invest'

	const ENV_COLORS	= ['3c8ae0', 'e0b23c', '9c5cd6', '3ab08a', 'd6485c']
	const ALL_MONTHS	= [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

	/* Nouvelles lignes créées avec un libellé vide : placeholder et intitulé de repli. */
	const ENVELOPE_PLACEHOLDER	= 'Nouvelle enveloppe'
	const BANNED_PLACEHOLDER	= 'Nouvelle section'
	const STYLE_OPTIONS	= [
		{ value: 'montant',	label: 'Montant (€)' },
		{ value: 'parts',	label: 'Parts' }
	]

	/* Enveloppes actives : une enveloppe archivée reste en base avec son journal. */
	const envelopes		= $derived(db.PROFIL_INVEST.filter(isActive))

	let selectedId: number | null	= $state(db.PROFIL_INVEST.find(isActive)?.id_profil_inv ?? null)
	let positionId: number | null	= $state(null)
	/* ?enveloppe=<id>&ajouter=1 : arrivée depuis Suivi, catalogue ouvert sur l'enveloppe. */
	const wanted					= parseInt(page.url.searchParams.get('enveloppe') ?? '', 10)
	if (Number.isInteger(wanted) && db.PROFIL_INVEST.some((row) => row.id_profil_inv === wanted)) selectedId = wanted
	let picking						= $state(page.url.searchParams.get('ajouter') === '1')

	const months		= $derived(indexMonths(db.VERSEMENT_DIV))
	const envelope		= $derived(findProfil(selectedId))
	const positions		= $derived(envelope ? byOrdre(positionsOf(db.ACTION, envelope.id_profil_inv)) : [])
	const position		= $derived(findAction(positionId))
	const investTotal	= $derived(investMensuelTotal(envelopes, db.ACTION))
	const blocked		= $derived(session.user?.role === 'bloque')

	const envelopeOptions = $derived.by(() =>
	{
		const options: { value: number; label: string; color: string }[] = []
		for (const profil of envelopes)
			options.push({ value: profil.id_profil_inv, label: profil.label || ENVELOPE_PLACEHOLDER, color: displayColor(profil.couleur) })
		return options
	})

	function findProfil(id: number | null): profilInvest | null
	{
		for (const profil of db.PROFIL_INVEST)
			if (profil.id_profil_inv === id) return profil
		return null
	}

	function findAction(id: number | null): action | null
	{
		for (const row of db.ACTION)
			if (row.id_action === id) return row
		return null
	}

	function moisCount(row: action): number
	{
		return monthsOf(row, months).length
	}

	let modal: HTMLElement | null = $state(null)

	/* Popup ouverte : la page ne défile plus et le focus passe dans la popup. */
	$effect(() =>
	{
		document.body.style.overflow = position || picking ? 'hidden' : ''
		return () => { document.body.style.overflow = '' }
	})

	$effect(() =>
	{
		modal?.focus()
	})

	function closePosition(): void
	{
		positionId	= null
		picking		= false
	}

	function onKeydown(event: KeyboardEvent): void
	{
		if (event.key === 'Escape' && (position || picking)) closePosition()
	}

	function selectEnvelope(id: number): void
	{
		selectedId = id
		positionId = null
	}

	async function addEnvelope(): Promise<void>
	{
		const created = await create('PROFIL_INVEST', '/profils', {
			label:				'',
			taux:				0,
			style_acquisition:	'montant',
			couleur:			ENV_COLORS[db.PROFIL_INVEST.length % ENV_COLORS.length]
		})
		if (created) selectEnvelope(created.id_profil_inv)
	}

	/* Titre choisi dans le catalogue : la position est créée, ou remise en service si elle
	   existait (archivée ou à 0 part), puis ouverte. */
	async function pickTitre(idProfil: number, chosen: titre): Promise<void>
	{
		picking = false
		const row = await addPositionToEnvelope(idProfil, chosen.id_titre)
		if (row) positionId = row.id_action
	}

	function archivePosition(row: action): void
	{
		archive(row, '/actions', row.id_action)
		positionId = null
	}

	function addBanned(): void
	{
		void create('BANNED', '/banned', { label: '', texte: '' })
	}
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head><title>Investir — mycount</title></svelte:head>

<section class="hero">
	<h1>Investir</h1>
	<p>Positions, rendements et versements mensuels, par enveloppe.</p>
</section>

<div class="stack">
	<StatTile label="Investissement / mois (total)" value={formatAmount(investTotal)} emphasis />

	<div class="actions">
		<ChipGroup
			label="Enveloppe"
			options={envelopeOptions}
			bind:value={() => selectedId ?? 0, (id) => selectEnvelope(id)}
		/>
		<button class="btn" type="button" onclick={addEnvelope}>+ Enveloppe</button>
	</div>
</div>

{#if envelope}
	{@const idProfil = envelope.id_profil_inv}
	{@const taux = envelope.taux ?? 0}
	{@const tint = displayColor(envelope.couleur)}

	<Section>
		{#snippet heading()}
			<!-- contenteditable plutôt qu'input : largeur au contenu, la règle garde sa place. -->
			<div
				class="heading"
				contenteditable="plaintext-only"
				role="textbox"
				tabindex="0"
				aria-label="Nom de l'enveloppe"
				data-placeholder={ENVELOPE_PLACEHOLDER}
				bind:textContent={() => envelope.label, (label) => edit(envelope, 'label', label ?? '', '/profils', idProfil)}
				onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }}
			></div>
		{/snippet}

		{#snippet aside()}
		<div class="settings inline">
			<div class="field">
				<span>Imposition</span>
				<AmountInput
					label="Taux d'imposition sur dividendes"
					unit="%"
					bind:value={() => envelope.taux, (value) => edit(envelope, 'taux', value ?? null, '/profils', idProfil)}
				/>
			</div>
			<div class="field">
				<span>Style d'acquisition</span>
				<div role="group" aria-label="Style d'acquisition">
					{#each STYLE_OPTIONS as option (option.value)}
						{@const selected = (envelope.style_acquisition ?? 'montant') === option.value}
						<button
							class="btn"
							class:current={selected}
							type="button"
							aria-pressed={selected}
							onclick={() => edit(envelope, 'style_acquisition', option.value, '/profils', idProfil)}
						>{option.label}</button>
					{/each}
				</div>
			</div>
		</div>
		{/snippet}

		<ValueRow label="Investissement / mois" value={formatAmount(envelopeInvestMensuel(db.ACTION, envelope))} color={tint} tone="accent" />

		<!-- Ligne : infos principales modifiables sur place. Clic sur le nom : détail en popup. -->
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>Nom</th>
						<th>Prix</th>
						<th>{envelope.style_acquisition === 'parts' ? 'Parts / mois' : 'Investi / mois'}</th>
						<th>Parts</th>
						<th>Rdt / an</th>
					</tr>
				</thead>
				<tbody>
					{#each positions as row (row.id_action)}
						{@const idRow = row.id_action}
						{@const rowTitre = findTitre(row.id_titre)}
						<tr>
							<td>
								<button class="row-button" class:current={idRow === positionId} type="button" onclick={() => (positionId = idRow)}>
									{labelOf(row)}
								</button>
							</td>
							<td>
								{#if rowTitre}
									<AmountInput
										label="Prix {rowTitre.nom}"
										bind:value={() => rowTitre.prix, (value) => editTitre(rowTitre, 'prix', value ?? null)}
									/>
								{/if}
							</td>
							<td>
								{#if envelope.style_acquisition === 'parts'}
									<AmountInput
										label="Parts achetées par mois {labelOf(row)}"
										unit="parts"
										bind:value={() => row.nb_inv, (value) => edit(row, 'nb_inv', value ?? null, '/actions', idRow)}
									/>
								{:else}
									<AmountInput
										label="Montant investi par mois {labelOf(row)}"
										bind:value={() => row.prix_inv, (value) => edit(row, 'prix_inv', value ?? null, '/actions', idRow)}
									/>
								{/if}
							</td>
							<td>{row.nb_part_acquis ?? 0}</td>
							<td style:color={tint}>{formatAmount(computeRendAn(row, moisCount(row), taux))}</td>
						</tr>
					{:else}
						<tr><td class="empty" colspan="5">Aucune position</td></tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="actions">
			<button class="btn" type="button" onclick={() => (picking = true)}>+ Ajouter une position</button>
		</div>

		{#if picking}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="backdrop" onclick={closePosition}></div>
			<div class="modal" role="dialog" aria-modal="true" aria-label="Choisir un titre" tabindex="-1" bind:this={modal}>
				<Tile>
					<div class="editor-head">
						<h3 class="modal-title">Catalogue</h3>
						<button class="btn" type="button" aria-label="Fermer" onclick={closePosition}>×</button>
					</div>
					<TitrePicker titres={db.TITRE} marches={db.MARCHE} disabled={blocked} oncreate={createTitre} onpick={(chosen) => pickTitre(idProfil, chosen)} />
				</Tile>
			</div>
		{/if}

		{#if position}
			{@const idAction = position.id_action}
			{@const positionTitre = findTitre(position.id_titre)}
			{@const count = moisCount(position)}

			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="backdrop" onclick={closePosition}></div>
			<div class="modal" role="dialog" aria-modal="true" aria-label={labelOf(position)} tabindex="-1" bind:this={modal}>
				<Tile>
					<div class="editor-head">
						<h3 class="modal-title">{labelOf(position)}</h3>
						<button class="btn" type="button" aria-label="Fermer" onclick={closePosition}>×</button>
					</div>

					<!-- Prix, dividende et mois de versement sont ceux du titre : communs à tous. -->
					<div class="settings">
						<div class="field">
							<span>Prix{positionTitre?.prix_perso ? ' (perso)' : ''}</span>
							{#if positionTitre}
								<AmountInput
									label="Prix unitaire"
									bind:value={() => positionTitre.prix, (value) => editTitre(positionTitre, 'prix', value ?? null)}
								/>
							{/if}
						</div>
						<div class="field">
							<span>Déjà acquis</span>
							<AmountInput
								label="Parts déjà acquises"
								unit="parts"
								bind:value={() => position.nb_part_acquis, (value) => edit(position, 'nb_part_acquis', value ?? null, '/actions', idAction)}
							/>
						</div>
						<div class="field">
							<span>Dividende (1 versement)</span>
							{#if positionTitre}
								<AmountInput
									label="Dividende par versement"
									bind:value={() => positionTitre.div, (value) => editTitre(positionTitre, 'div', value ?? null)}
								/>
							{/if}
						</div>
						<div class="field">
							<span>Investissement / mois</span>
							{#if envelope.style_acquisition === 'parts'}
								<AmountInput
									label="Parts achetées par mois"
									unit="parts"
									bind:value={() => position.nb_inv, (value) => edit(position, 'nb_inv', value ?? null, '/actions', idAction)}
								/>
							{:else}
								<AmountInput
									label="Montant investi par mois"
									bind:value={() => position.prix_inv, (value) => edit(position, 'prix_inv', value ?? null, '/actions', idAction)}
								/>
							{/if}
						</div>
					</div>

					<div class="months-head">
						<span class="kicker">Mois de versement · {count}×/an</span>
						<span>
							<button class="btn" type="button" disabled={blocked} onclick={() => setVersements(position.id_titre, ALL_MONTHS)}>Tous</button>
							<button class="btn" type="button" disabled={blocked} onclick={() => setVersements(position.id_titre, [])}>Aucun</button>
						</span>
					</div>

					<div class="months" style:--month-color={tint}>
						{#each MONTH_LABELS_SHORT as label, index (label)}
							{@const paid = monthsOf(position, months).includes(index + 1)}
							<button class="month" class:paid type="button" aria-pressed={paid} disabled={blocked} onclick={() => toggleVersement(position.id_titre, index + 1)}>
								{label}
							</button>
						{/each}
					</div>

					<ValueRow label="Dividende annuel" value={formatAmount(roundMoney(divOf(position) * count))} />
					<ValueRow label="Rendement net" value="{computeRendNet(position, count, taux)} %" />
					<ValueRow label="Valeur acquise" value={formatAmount(roundMoney(prixOf(position) * (position.nb_part_acquis ?? 0)))} />
					<ValueRow label="Rendement / an (net d'impôt)" value={formatAmount(computeRendAn(position, count, taux))} tone="accent" />

					<div class="actions">
						<button class="btn danger" type="button" onclick={() => archivePosition(position)}>Archiver la position</button>
					</div>
				</Tile>
			</div>
		{/if}
	</Section>
{/if}

<Section title="Taux de rendement global">
	<TileGrid items={envelopes} min="160px">
		{#snippet tile(profil: profilInvest)}
			<StatTile label={profil.label || ENVELOPE_PLACEHOLDER} value="{envelopeTauxGlobal(db.ACTION, profil, months)} %" color={displayColor(profil.couleur)} />
		{/snippet}
	</TileGrid>
</Section>

<Section title="À éviter">
	{#each db.BANNED as note (note.id_banned)}
		{@const idBanned = note.id_banned}
		<div class="note">
			<div class="editor-head">
				<input
					class="input"
					aria-label="Titre de la section"
					placeholder={BANNED_PLACEHOLDER}
					bind:value={() => note.label, (label) => edit(note, 'label', label, '/banned', idBanned)}
				/>
				<button
					class="btn"
					type="button"
					aria-label="Supprimer la section"
					onclick={() => remove(db.BANNED, (row) => row.id_banned === idBanned, '/banned', idBanned)}
				>×</button>
			</div>
			<textarea
				class="input"
				rows="3"
				placeholder="Ex : Air Liquide (trop chère), ETF X (frais élevés)…"
				bind:value={() => note.texte ?? '', (texte) => edit(note, 'texte', texte, '/banned', idBanned)}
			></textarea>
		</div>
	{/each}

	<div class="actions">
		<button class="btn" type="button" onclick={addBanned}>+ Ajouter une section</button>
	</div>
</Section>

<style>
	/* Espace sous la sélection d'enveloppe : moitié du .stack global. */
	.stack {
		margin-bottom: clamp(24px, 5vw, 40px);
	}

	/* Même rendu que le h2 de Section, mais éditable. */
	.heading {
		margin:			0;
		font-size:		13px;
		letter-spacing:	0.08em;
		text-transform:	uppercase;
		color:			var(--color-neutral-500);
		outline:		none;
	}

	.heading:empty::before {
		content:	attr(data-placeholder);
		color:		var(--color-neutral-800);
	}

	/* Largeurs au contenu, repli à la ligne, bas des champs alignés sur une même ligne. */
	.settings {
		display:		flex;
		flex-wrap:		wrap;
		align-items:	flex-end;
		gap:			var(--space-6);
		margin-bottom:	var(--space-6);
	}

	/* Sur la ligne du titre : la marge de l'en-tête de Section suffit. */
	.settings.inline {
		margin-bottom: 0;
	}

	/* Pas d'étirement : le soulignement d'un montant couvre valeur + unité, pas la colonne. */
	.settings > .field {
		flex:			none;
		align-items:	flex-start;
		min-width:		0;
		max-width:		100%;
	}


	.current {
		color: var(--color-accent-300);
	}

	/* Fond repris du menu mobile du portfolio. */
	.backdrop {
		position:	fixed;
		inset:		0;
		z-index:	10;
		background:	color-mix(in srgb, var(--color-neutral-900) 55%, transparent);
		animation:	fade 0.22s ease;
	}

	.modal {
		position:	fixed;
		top:		50%;
		left:		50%;
		z-index:	11;
		width:		min(640px, calc(100vw - 32px));
		max-height:	calc(100svh - 32px);
		overflow-y:	auto;
		background:	var(--color-bg);
		transform:	translate(-50%, -50%);
		animation:	fade 0.22s ease;
	}

	.modal:focus {
		outline: none;
	}

	@keyframes fade {
		from { opacity: 0; }
	}

	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.modal {
			animation: none;
		}
	}

	.editor-head {
		display:		flex;
		align-items:	center;
		gap:			var(--space-3);
		margin-bottom:	var(--space-6);
	}

	.modal-title {
		margin:			0;
		font-size:		18px;
		font-weight:	inherit;
	}

	.months-head {
		display:			flex;
		align-items:		center;
		justify-content:	space-between;
		margin-top:			var(--space-6);
	}

	.months {
		display:				grid;
		grid-template-columns:	repeat(6, 1fr);
		gap:					var(--space-2);
		margin:					var(--space-3) 0 var(--space-6);
	}

	.month {
		padding:		var(--space-2) 0;
		border:			1px solid var(--color-neutral-800);
		border-radius:	var(--radius-sm);
		background:		transparent;
		color:			var(--color-neutral-400);
		font:			inherit;
		font-size:		12px;
		cursor:			pointer;
	}

	.paid {
		border-color:	var(--month-color);
		background:		color-mix(in oklab, var(--month-color) 35%, transparent);
		color:			var(--color-text);
	}

	.note {
		margin-bottom: var(--space-6);
	}

	textarea {
		resize: vertical;
	}
</style>
