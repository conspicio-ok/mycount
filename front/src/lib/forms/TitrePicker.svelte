<!--
	@component
	Choix d'un titre dans le catalogue commun : recherche par nom, filtrée par marché,
	et proposition de création quand le nom n'existe pas sur ce marché (un nom + un marché
	= un titre unique ; le même nom sur un autre marché est un autre titre).
	Aucune écriture ici : l'appelant reçoit le titre choisi via `onpick`.
	@example
	```html
	<TitrePicker titres={db.TITRE} marches={db.MARCHE} oncreate={createTitre} onpick={(titre) => …} />
	```
-->
<script lang="ts">
	import type { marche, titre } from '$data/types'

	interface TitrePickerProps
	{
		titres:		titre[];
		marches:	marche[];
		disabled?:	boolean;	/* compte bloqué : pas de création */
		oncreate:	(nom: string, idMarche: number, prix: number | null) => Promise<titre | undefined>;
		onpick:		(titre: titre) => void;
	}

	let { titres, marches, disabled = false, oncreate, onpick }: TitrePickerProps = $props()

	let query				= $state('')
	/* Marché choisi ; tant qu'aucun choix, le premier de la liste (réactif). */
	let chosenMarche: number | null	= $state(null)
	const idMarche	= $derived(chosenMarche ?? marches[0]?.id_marche ?? 0)
	let prix: number | null	= $state(null)
	let creating			= $state(false)

	const needle	= $derived(query.trim().toLowerCase())
	const matches	= $derived(titres.filter((row) => row.id_marche === idMarche && (needle === '' || row.nom.toLowerCase().includes(needle))))
	const exact		= $derived(matches.find((row) => row.nom.toLowerCase() === needle) ?? null)

	function marcheLabel(id: number): string
	{
		return marches.find((row) => row.id_marche === id)?.label ?? ''
	}

	async function create(): Promise<void>
	{
		if (creating || exact || needle === '') return

		creating = true
		const created = await oncreate(query.trim(), idMarche, prix)
		creating = false
		if (created) onpick(created)
	}
</script>

<div class="picker">
	<div class="row">
		<input
			class="input"
			type="search"
			placeholder="Nom du titre"
			aria-label="Rechercher un titre"
			autocomplete="off"
			spellcheck="false"
			bind:value={query}
			onkeydown={(event) => { if (event.key === 'Enter') { if (exact) onpick(exact); else void create() } }}
		/>
		<select class="input marche" aria-label="Marché" value={idMarche} onchange={(event) => (chosenMarche = Number(event.currentTarget.value))}>
			{#each marches as row (row.id_marche)}
				<option value={row.id_marche}>{row.label}</option>
			{/each}
		</select>
	</div>

	<ul class="results">
		{#each matches.slice(0, 8) as row (row.id_titre)}
			<li>
				<button class="row-button" type="button" onclick={() => onpick(row)}>
					{row.nom}
					<span class="meta">{marcheLabel(row.id_marche)}{row.prix === null ? '' : ` · ${row.prix} €`}</span>
				</button>
			</li>
		{:else}
			<li class="meta">{needle === '' ? 'Tapez un nom' : 'Aucun titre sur ce marché'}</li>
		{/each}
	</ul>

	{#if needle !== '' && !exact && !disabled}
		<div class="row">
			<span class="meta">Créer « {query.trim()} » sur {marcheLabel(idMarche)}</span>
			<input class="input prix" type="number" step="any" inputmode="decimal" placeholder="Prix" aria-label="Prix" bind:value={prix} />
			<button class="btn" type="button" disabled={creating} onclick={create}>Créer</button>
		</div>
	{/if}
</div>

<style>
	.picker {
		display:		flex;
		flex-direction:	column;
		gap:			var(--space-3);
	}

	.row {
		display:		flex;
		flex-wrap:		wrap;
		align-items:	baseline;
		gap:			var(--space-3);
	}

	.row > .input:first-child {
		flex: 1 1 12ch;
	}

	.marche,
	.prix {
		width: auto;
	}

	/* Même hauteur que le champ de recherche : les deux soulignements tombent sur la même ligne. */
	.marche {
		align-self: stretch;
	}

	/* Liste ouverte stylable : Chromium récent (appearance base-select). Ailleurs, liste native. */
	.marche,
	.marche::picker(select) {
		appearance: base-select;
	}

	.marche::picker(select) {
		border:		1px solid var(--color-neutral-800);
		background:	var(--color-bg);
		color:		var(--color-text);
	}

	.results {
		margin:		0;
		padding:	0;
		list-style:	none;
	}

	.results li {
		padding: var(--space-1) 0;
	}

	.meta {
		margin-left:	var(--space-2);
		font-size:		12px;
		color:			var(--color-neutral-500);
	}
</style>
