<script lang="ts">
	import Section		from '$lib/layout/Section.svelte'
	import Tile			from '$lib/patterns/Tile.svelte'
	import ValueRow		from '$lib/patterns/ValueRow.svelte'
	import ChipGroup	from '$lib/patterns/ChipGroup.svelte'
	import { formatAmount, displayColor }	from '$lib/format'
	import { db }						from '$data/store.svelte'
	import { roundMoney }				from '$data/money'
	import type { yearAggregate }		from '$data/invest'
	import { computeEnvelopeYearlySeries, indexMonths, investiOf }	from '$data/invest'

	interface yearRow
	{
		year:		number;
		patrimoine:	number;
		investAn:	number;
		gainAn:		number;
		capPea:		boolean;
		perProfil:	Record<number, yearAggregate>;
	}

	const PEA_PLAFOND		= 150000
	const HORIZON_OPTIONS	= [
		{ value: 5,		label: '5 ans' },
		{ value: 10,	label: '10 ans' },
		{ value: 20,	label: '20 ans' },
		{ value: 30,	label: '30 ans' }
	]

	const today			= new Date()
	const currentYear	= today.getFullYear()

	let horizon						= $state(5)
	/* Années passées affichées : 1 par défaut, si elle contient des investissements. */
	let pastYears					= $state(1)
	let selectedYear: number | null	= $state(null)

	const months = $derived(indexMonths(db.VERSEMENT_DIV))

	/* Passé : investi réel par année (journal). Valeur et gain de fin d'année inconnus sans
	   historique de prix : seule la colonne Investi est remplie. */
	const pastRows = $derived.by(() =>
	{
		const result: { year: number; investi: number }[] = []
		for (let offset = pastYears; offset >= 1; offset--)
		{
			const year		= currentYear - offset
			const investi	= investiOf(db.MOUVEMENT, null, String(year))
			if (investi !== 0 || offset < pastYears) result.push({ year, investi })
		}
		return result
	})

	/* Année en cours : journal des mouvements. Futur : calculé mois par mois depuis Investir. */
	const rows = $derived.by(() =>
	{
		const result: yearRow[]	= []
		let peaId: number | null	= null

		for (const profil of db.PROFIL_INVEST)
		{
			if (peaId === null && /pea/i.test(profil.label)) peaId = profil.id_profil_inv

			for (const point of computeEnvelopeYearlySeries(db.ACTION, profil, months, db.MOUVEMENT, today, horizon))
			{
				let row = result.find((candidate) => candidate.year === point.year)
				if (!row)
				{
					row = { year: point.year, patrimoine: 0, investAn: 0, gainAn: 0, capPea: false, perProfil: {} }
					result.push(row)
				}

				row.perProfil[profil.id_profil_inv] = point
				row.patrimoine	+= point.valeurFin
				row.investAn	+= point.investi
				row.gainAn		+= point.gain
			}
		}

		result.sort((a, b) => a.year - b.year)
		for (const row of result)
		{
			row.patrimoine	= roundMoney(row.patrimoine)
			row.investAn	= roundMoney(row.investAn)
			row.gainAn		= roundMoney(row.gainAn)
			row.capPea		= peaId !== null && (row.perProfil[peaId]?.valeurFin ?? 0) >= PEA_PLAFOND
		}
		return result
	})

	const selected = $derived.by(() =>
	{
		for (const row of rows)
			if (row.year === selectedYear) return row
		return null
	})
</script>

<svelte:head><title>Projection — mycount</title></svelte:head>

<section class="hero">
	<h1>Projection</h1>
	<p>Croissance du patrimoine à partir des positions et versements saisis dans Investir.</p>
</section>

<div class="stack">
	<ChipGroup label="Horizon" options={HORIZON_OPTIONS} bind:value={horizon} />
</div>

<Section title="Années">
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Année</th>
					<th>Investi / an</th>
					<th>Gain / an</th>
					<th>Patrimoine</th>
				</tr>
			</thead>
			<tbody>
				{#each pastRows as row (row.year)}
					<tr class="past">
						<td>{row.year}</td>
						<td>{formatAmount(row.investi)}</td>
						<td>—</td>
						<td>—</td>
					</tr>
				{/each}
				{#each rows as row (row.year)}
					<tr class:current={row.year === currentYear} class:capped={row.capPea}>
						<td>
							<button class="row-button" type="button" onclick={() => (selectedYear = row.year)}>{row.year}</button>
							{#if row.capPea}
								<span class="tag tag-neutral">Plafond PEA</span>
							{/if}
						</td>
						<td>{formatAmount(row.investAn)}</td>
						<td class="gain">+{formatAmount(row.gainAn)}</td>
						<td>{formatAmount(row.patrimoine)}</td>
					</tr>
				{:else}
					<tr><td class="empty" colspan="4">Aucune enveloppe — ajoutez-en une dans Investir</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="actions">
		<button class="btn" type="button" onclick={() => (pastYears += 5)}>Afficher plus d'années passées</button>
	</div>
	<p class="hint">Sélectionnez une année pour le détail par enveloppe.</p>

	{#if selected}
		<div class="detail">
			<Tile>
				<div class="detail-head">
					<h3>Année {selected.year}</h3>
					<button class="btn" type="button" aria-label="Fermer" onclick={() => (selectedYear = null)}>×</button>
				</div>

				<ValueRow label="Patrimoine total" value={formatAmount(selected.patrimoine)} />
				<ValueRow label="Investi / an" value={formatAmount(selected.investAn)} />
				<ValueRow label="Revenu passif / mois" value={formatAmount(roundMoney(selected.gainAn / 12))} tone="accent" />

				{#each db.PROFIL_INVEST as profil (profil.id_profil_inv)}
					{@const point = selected.perProfil[profil.id_profil_inv]}
					<h4 class="envelope" style:color={displayColor(profil.couleur)}>{profil.label || 'Nouvelle enveloppe'}</h4>
					<ValueRow label="Valeur" value={formatAmount(point?.valeurFin ?? 0)} />
					<ValueRow label="Investi / an" value={formatAmount(point?.investi ?? 0)} />
					<ValueRow label="Gain / an" value="+{formatAmount(point?.gain ?? 0)}" tone="accent" />
				{/each}
			</Tile>
		</div>
	{/if}
</Section>

<style>
	.tag {
		margin-left: var(--space-2);
	}

	.current td {
		background: color-mix(in oklab, var(--color-accent-800) 35%, transparent);
	}

	.past td {
		color: var(--color-neutral-500);
	}

	.capped td {
		background: color-mix(in oklab, #d6485c 18%, transparent);
	}

	.gain {
		color: var(--color-accent-300);
	}

	.hint {
		margin-top:	var(--space-4);
		font-size:	12px;
		color:		var(--color-neutral-500);
	}

	.detail {
		margin-top: var(--space-8);
	}

	.detail-head {
		display:			flex;
		align-items:		center;
		justify-content:	space-between;
	}

	h3 {
		margin: 0;
	}

	.envelope {
		margin:		var(--space-8) 0 0;
		font-size:	15px;
	}
</style>
