<script lang="ts">
	import { resolve }	from '$app/paths'
	import Section		from '$lib/layout/Section.svelte'
	import TileGrid		from '$lib/patterns/TileGrid.svelte'
	import StatTile		from '$lib/patterns/StatTile.svelte'
	import ValueRow		from '$lib/patterns/ValueRow.svelte'
	import ChipGroup	from '$lib/patterns/ChipGroup.svelte'
	import AmountInput	from '$lib/forms/AmountInput.svelte'
	import { formatAmount, displayColor }							from '$lib/format'
	import {
		db, byOrdre, createMouvements, editMouvement, removeMouvement, type mouvementDraft
	} from '$data/store.svelte'
	import type { action, mouvement, profilInvest }		from '$data/types'
	import { roundMoney }										from '$data/money'
	import { MONTH_LABELS, MONTH_LABELS_SHORT, monthDate }		from '$data/date'
	import { gainOf, investiOf, isActive, labelOf, prixOf, valeurOf }	from '$data/invest'

	interface stat
	{
		label:	string;
		value:	string;
		color?:	string;
	}

	const today			= new Date()
	const currentYear	= today.getFullYear()

	/* Années proposées : de l'année précédant le premier mouvement à aujourd'hui, avec « … »
	   pour saisir une année hors plage (mouvements antérieurs à rattraper). */
	const firstYear = $derived.by(() =>
	{
		let first = currentYear
		for (const row of db.MOUVEMENT)
		{
			const rowYear = parseInt(row.date.slice(0, 4), 10)
			if (rowYear < first) first = rowYear
		}
		return first - 1
	})

	let year			= $state(currentYear)
	let month			= $state(today.getMonth() + 1)
	let customYear		= $state(false)
	let customInput		= $state('')

	/* Années ajoutées à la main : gardées dans le navigateur EXTRA_YEAR_TTL ms, le temps de
	   saisir des mouvements ; une année qui en contient entre dans la plage et n'en a plus besoin. */
	const EXTRA_YEARS_KEY	= 'suivi.extraYears'
	const EXTRA_YEAR_TTL	= 7 * 24 * 3600 * 1000

	let extraYears: Record<number, number> = $state(loadExtraYears())

	function loadExtraYears(): Record<number, number>
	{
		try
		{
			const stored: Record<string, number> = JSON.parse(localStorage.getItem(EXTRA_YEARS_KEY) ?? '{}')
			const kept: Record<number, number> = {}
			for (const key in stored)
				if (Date.now() - stored[key] < EXTRA_YEAR_TTL) kept[Number(key)] = stored[key]
			return kept
		}
		catch { return {} }
	}

	function addExtraYear(): void
	{
		const value = parseInt(customInput, 10)
		customYear	= false
		customInput	= ''
		if (!Number.isInteger(value) || value < 1900 || value > currentYear) return

		if (value < firstYear)
		{
			extraYears[value] = Date.now()
			try { localStorage.setItem(EXTRA_YEARS_KEY, JSON.stringify(extraYears)) } catch { /* stockage indisponible */ }
		}
		year = value
	}

	const YEAR_OPTIONS = $derived.by(() =>
	{
		const options: { value: number; label: string }[] = []
		for (let candidate = currentYear; candidate >= firstYear; candidate--)
			options.push({ value: candidate, label: String(candidate) })
		for (const key in extraYears)
			if (Number(key) < firstYear) options.push({ value: Number(key), label: key })
		return options
	})

	const MONTH_OPTIONS: { value: number; label: string }[] = []
	for (let i = 0; i < 12; i++)
		MONTH_OPTIONS.push({ value: i + 1, label: MONTH_LABELS_SHORT[i] })

	const date = $derived(monthDate(year, month))

	/* Patrimoine réel : voir les définitions dans invest.ts (investi, valeur, gain). */
	const recap = $derived.by(() =>
	{
		const investi	= investiOf(db.MOUVEMENT, null)
		const valeur	= valeurOf(db.ACTION)
		return { investi, valeur, gain: gainOf(db.ACTION, db.MOUVEMENT) }
	})

	/* Rouge / vert selon le signe ; couleurs partagées avec les lignes du récapitulatif. */
	const GAIN_UP	= '#8fe0b0'
	const GAIN_DOWN	= '#e0808f'

	function gainColor(gain: number): string
	{
		return gain < 0 ? GAIN_DOWN : GAIN_UP
	}

	const recapStats: stat[] = $derived([
		{ label: 'Total investi',		value: formatAmount(recap.investi) },
		{ label: 'Valeur actuelle',		value: formatAmount(recap.valeur) },
		{ label: 'Gain latent',			value: formatAmount(recap.gain), color: gainColor(recap.gain) },
		{ label: 'Investi ce mois',		value: formatAmount(investiOf(db.MOUVEMENT, null, date.slice(0, 7))) }
	])

	/* ── Mouvements ─────────────────────────────────────────────────────────
	   Une ligne de saisie par position et par sens. Case vide = valeur proposée (placeholder),
	   case saisie = saisie. Seules les lignes cochées partent, en une requête. */

	type sens = mouvement['sens']

	interface draftLine
	{
		checked:	boolean | null;	/* null : suit la valeur par défaut */
		nb_part:	number | null;
		prix:		number | null;
		date:		string;
	}

	const SENS_OPTIONS: { value: sens; label: string }[] = [
		{ value: 'achat', label: 'Achat' },
		{ value: 'vente', label: 'Vente' }
	]

	let activeSens: sens						= $state('achat')
	let selectedProfil: number | null			= $state(db.PROFIL_INVEST.find(isActive)?.id_profil_inv ?? null)

	const profil = $derived(db.PROFIL_INVEST.find((row) => row.id_profil_inv === selectedProfil) ?? null)

	const envelopeOptions = $derived(db.PROFIL_INVEST.filter(isActive).map((row) => ({
		value: row.id_profil_inv, label: row.label || 'Nouvelle enveloppe', color: displayColor(row.couleur)
	})))

	const HISTORY_SHOWN = 5
	let lines: Record<string, draftLine>	= $state({})
	let saving: sens | null					= $state(null)

	const monthPrefix	= $derived(date.slice(0, 7))
	const isCurrentMonth	= $derived(year === currentYear && month === today.getMonth() + 1)
	const defaultDate	= $derived(isCurrentMonth ? isoDay(today) : date)

	const monthMouvements = $derived(
		db.MOUVEMENT
			.filter((row) => row.date.startsWith(monthPrefix))
			.sort((a, b) => a.date.localeCompare(b.date) || a.id_mouvement - b.id_mouvement)
	)

	/* Changer de mois repart de lignes vides : les propositions dépendent du mois. */
	$effect(() =>
	{
		void monthPrefix
		lines = {}
	})

	function isoDay(day: Date): string
	{
		return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
	}

	function positionsOfProfil(profil: profilInvest): action[]
	{
		return byOrdre(db.ACTION.filter((row) => row.id_profil_inv === profil.id_profil_inv && row.archive_le === null))
	}

	/* Lecture sans écriture (interdite pendant le rendu) : une ligne jamais touchée n'est
	   créée dans `lines` qu'à la première saisie, par setLine. */
	function lineOf(sensValue: sens, row: action): draftLine
	{
		return lines[`${sensValue}-${row.id_action}`] ?? { checked: null, nb_part: null, prix: null, date: defaultDate }
	}

	function setLine<K extends keyof draftLine>(sensValue: sens, row: action, field: K, value: draftLine[K]): void
	{
		const key = `${sensValue}-${row.id_action}`
		lines[key] ??= { checked: null, nb_part: null, prix: null, date: defaultDate }
		lines[key][field] = value
	}

	function boughtThisMonth(idAction: number): boolean
	{
		return monthMouvements.some((row) => row.id_action === idAction && row.sens === 'achat')
	}

	/* Proposition du plan : mois en cours seulement, et tant qu'aucun achat n'est validé. */
	function proposedParts(sensValue: sens, profil: profilInvest, row: action): number | null
	{
		if (sensValue !== 'achat' || !isCurrentMonth || boughtThisMonth(row.id_action)) return null

		if (profil.style_acquisition === 'parts') return row.nb_inv || null
		if (!row.prix_inv || !prixOf(row)) return null
		return Math.round((row.prix_inv / prixOf(row)) * 10000) / 10000
	}

	function effectiveParts(line: draftLine, proposed: number | null): number | null
	{
		return line.nb_part ?? proposed
	}

	function isChecked(line: draftLine, proposed: number | null): boolean
	{
		if (!effectiveParts(line, proposed)) return false
		return line.checked ?? proposed !== null
	}

	/* Taper dans une case coche la ligne. */
	function setAmount(sensValue: sens, row: action, field: 'nb_part' | 'prix', value: number | null): void
	{
		setLine(sensValue, row, field, value)
		if (value !== null) setLine(sensValue, row, 'checked', true)
	}

	function drafts(sensValue: sens): mouvementDraft[]
	{
		const result: mouvementDraft[] = []
		if (profil)
		{
			for (const row of positionsOfProfil(profil))
			{
				const line		= lineOf(sensValue, row)
				const proposed	= proposedParts(sensValue, profil, row)
				if (!isChecked(line, proposed)) continue

				result.push({
					id_action:	row.id_action,
					date:		line.date || defaultDate,
					sens:		sensValue,
					nb_part:	effectiveParts(line, proposed) as number,
					prix:		line.prix ?? (prixOf(row) || null)
				})
			}
		}
		return result
	}

	async function validate(sensValue: sens): Promise<void>
	{
		const pendingDrafts = drafts(sensValue)
		if (pendingDrafts.length === 0) return

		saving = sensValue
		const saved = await createMouvements(pendingDrafts)
		saving = null
		if (!saved) return

		for (const key in lines)
			if (key.startsWith(`${sensValue}-`)) delete lines[key]
	}

	function positionLabel(idAction: number): string
	{
		for (const row of db.ACTION)
			if (row.id_action === idAction) return labelOf(row)
		return ''
	}

</script>

<svelte:head><title>Suivi — mycount</title></svelte:head>

<section class="hero">
	<h1>Suivi</h1>
	<p>La vraie valeur de chaque compte, mois par mois.</p>
</section>

<div class="stack">
	<StatTile label="Valeur actuelle du patrimoine" value={formatAmount(recap.valeur)} emphasis />
	<div class="years">
		<ChipGroup label="Année" options={YEAR_OPTIONS} bind:value={year} />
		{#if customYear}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="chip year"
				type="text"
				inputmode="numeric"
				aria-label="Année"
				placeholder={String(firstYear - 1)}
				autofocus
				bind:value={customInput}
				onblur={addExtraYear}
				onkeydown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { customInput = ''; event.currentTarget.blur() } }}
			/>
		{:else}
			<button class="chip" type="button" aria-label="Autre année" onclick={() => (customYear = true)}>…</button>
		{/if}
	</div>
	<ChipGroup label="Mois" options={MONTH_OPTIONS} bind:value={month} />
</div>

<Section title="Mouvements · {MONTH_LABELS[month - 1]} {year}">
	<div class="stack">
		<ChipGroup label="Enveloppe" options={envelopeOptions} bind:value={() => selectedProfil ?? 0, (id) => (selectedProfil = id)} />
	</div>

	<div class="trade">
		<!-- Même sélecteur que connexion : affiché seulement quand un seul panneau tient. -->
		<div class="modes">
			{#each SENS_OPTIONS as option (option.value)}
				<button
					class="mode"
					class:active={option.value === activeSens}
					type="button"
					aria-pressed={option.value === activeSens}
					onclick={() => (activeSens = option.value)}
				>{option.label}</button>
			{/each}
		</div>

		<div class="panels">
			{#each SENS_OPTIONS as option (option.value)}
				{@const sensValue = option.value}
				{@const count = drafts(sensValue).length}
				{@const rows = profil ? positionsOfProfil(profil).filter((row) => sensValue === 'achat' || (row.nb_part_acquis ?? 0) > 0) : []}
				<div class="panel" class:active={sensValue === activeSens}>
					<h3 class="panel-title">{option.label}</h3>

					{#each rows as row (row.id_action)}
						{@const line = lineOf(sensValue, row)}
						{@const proposed = proposedParts(sensValue, profil as profilInvest, row)}
						{@const checked = isChecked(line, proposed)}
						<div class="line">
							<input
								type="checkbox"
								aria-label="Prendre {labelOf(row)}"
								disabled={!effectiveParts(line, proposed)}
								checked={checked}
								onchange={(event) => setLine(sensValue, row, 'checked', event.currentTarget.checked)}
							/>
							<span class="line-label">{labelOf(row)}</span>
							<AmountInput
								label="Parts {labelOf(row)}"
								unit="parts"
								placeholder={proposed === null ? '0' : String(proposed)}
								bind:value={() => line.nb_part, (value) => setAmount(sensValue, row, 'nb_part', value ?? null)}
							/>
							<AmountInput
								label="Prix {labelOf(row)}"
								placeholder={String(prixOf(row))}
								bind:value={() => line.prix, (value) => setAmount(sensValue, row, 'prix', value ?? null)}
							/>
							<input class="input date" type="date" aria-label="Date {labelOf(row)}" bind:value={() => line.date, (value) => setLine(sensValue, row, 'date', value)} />
						</div>
					{:else}
						<p class="empty">{sensValue === 'achat' ? 'Aucune position' : 'Aucune part à vendre'}</p>
					{/each}

					<div class="actions">
						<button class="btn" type="button" disabled={count === 0 || saving !== null} onclick={() => validate(sensValue)}>
							Valider ({count})
						</button>
						{#if sensValue === 'achat' && profil}
							<a class="btn" href="{resolve('/investir')}?enveloppe={profil.id_profil_inv}&ajouter=1">+ Action</a>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Date</th>
					<th>Position</th>
					<th>Sens</th>
					<th>Parts</th>
					<th>Prix</th>
					<th><span class="visually-hidden">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each monthMouvements.slice(-HISTORY_SHOWN).reverse() as row (row.id_mouvement)}
					<tr>
						<td>
							<input
								class="input date"
								type="date"
								aria-label="Date"
								bind:value={() => row.date, (value) => { if (value) editMouvement(row, 'date', value) }}
							/>
						</td>
						<td>{positionLabel(row.id_action)}</td>
						<td>{row.sens === 'achat' ? 'Achat' : 'Vente'}</td>
						<td>
							<AmountInput
								label="Parts"
								unit="parts"
								bind:value={() => row.nb_part, (value) => { if (value) editMouvement(row, 'nb_part', value) }}
							/>
						</td>
						<td>
							<AmountInput
								label="Prix"
								bind:value={() => row.prix, (value) => editMouvement(row, 'prix', value ?? null)}
							/>
						</td>
						<td>
							<button class="btn danger" type="button" aria-label="Supprimer le mouvement" onclick={() => removeMouvement(row)}>×</button>
						</td>
					</tr>
				{:else}
					<tr><td class="empty" colspan="6">Aucun mouvement ce mois</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if monthMouvements.length > HISTORY_SHOWN}
		<a class="btn more" href="{resolve('/compte')}#historique">Historique complet ({monthMouvements.length})</a>
	{/if}
</Section>

<Section title="Récapitulatif">
	<TileGrid items={recapStats} min="160px">
		{#snippet tile(item: stat)}
			<StatTile label={item.label} value={item.value} color={item.color} />
		{/snippet}
	</TileGrid>

	{#each db.PROFIL_INVEST as envelope (envelope.id_profil_inv)}
		{@const positions = positionsOfProfil(envelope)}
		{@const valeur = valeurOf(positions)}
		{@const gain = gainOf(positions, db.MOUVEMENT)}
		<div class="recap-row">
			<ValueRow label={envelope.label || 'Nouvelle enveloppe'} value={formatAmount(valeur)} color={displayColor(envelope.couleur)} />
			<span class="gain" style:color={gainColor(gain)}>{gain >= 0 ? '+' : ''}{formatAmount(gain)}</span>
		</div>
	{/each}
</Section>

<style>
	.recap-row {
		display:		flex;
		align-items:	baseline;
		gap:			var(--space-4);
	}

	.recap-row > :global(:first-child) {
		flex: 1;
	}

	.years {
		display:		flex;
		align-items:	center;
		gap:			var(--space-3);
	}

	/* Même rendu que les pastilles de ChipGroup. */
	.chip {
		flex:			none;
		padding:		var(--space-2) var(--space-4);
		border:			1px solid color-mix(in oklab, var(--color-accent-500) 45%, transparent);
		border-radius:	var(--radius-md);
		background:		transparent;
		color:			var(--color-neutral-300);
		font:			inherit;
		font-size:		13px;
		cursor:			pointer;
	}

	.chip:hover,
	.chip:focus-visible {
		border-color:	var(--color-accent-400);
		outline:		none;
	}

	.year {
		width:	7ch;
		cursor:	text;
	}

	/* Un panneau à la fois sous 720px de large (sélecteur visible), les deux côte à côte au-delà.
	   Container query : c'est la place de la section qui compte, pas celle de l'écran. */
	.trade {
		container-type:	inline-size;
		margin-bottom:	var(--space-8);
	}

	.modes {
		display:		flex;
		gap:			0 var(--space-8);
		margin-bottom:	var(--space-6);
		font-size:		18px;
	}

	/* Même rendu que le sélecteur de connexion. */
	.mode {
		padding:	0;
		border:		0;
		background:	transparent;
		color:		var(--color-neutral-500);
		font:		inherit;
		cursor:		pointer;
	}

	.mode.active {
		color: var(--color-text);
	}

	.panels {
		display:				grid;
		grid-template-columns:	1fr;
		gap:					var(--space-8);
	}

	.panel {
		display:	none;
		min-width:	0;
	}

	.panel.active {
		display: block;
	}

	.panel-title {
		display: none;
	}

	.panel .empty {
		margin:	0;
		color:	var(--color-neutral-500);
	}

	.more {
		margin-top: var(--space-4);
	}

	.line {
		display:		flex;
		flex-wrap:		wrap;
		align-items:	baseline;
		gap:			var(--space-2) var(--space-4);
		padding:		var(--space-2) 0;
	}

	.line-label {
		flex:		1 1 10ch;
		min-width:	0;
	}

	.date {
		width: auto;
	}

	@container (min-width: 720px) {
		.modes {
			display: none;
		}

		.panels {
			grid-template-columns: 1fr 1px 1fr;
		}

		/* Filet vertical entre achat et vente. */
		.panels::before {
			content:	'';
			grid-column:	2;
			grid-row:	1;
			background:	var(--color-divider);
		}

		.panel:last-child {
			grid-column: 3;
		}

		.panel {
			display: block;
		}

		.panel-title {
			display:		block;
			margin:			0;
			font-size:		18px;
			font-weight:	inherit;
		}
	}
</style>
