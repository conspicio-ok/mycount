<script lang="ts">
	import Section		from '$lib/layout/Section.svelte'
	import Tile			from '$lib/patterns/Tile.svelte'
	import TileGrid		from '$lib/patterns/TileGrid.svelte'
	import StatTile		from '$lib/patterns/StatTile.svelte'
	import ValueRow		from '$lib/patterns/ValueRow.svelte'
	import Disclosure	from '$lib/patterns/Disclosure.svelte'
	import AmountInput	from '$lib/forms/AmountInput.svelte'
	import { formatAmount, displayColor }	from '$lib/format'
	import { roundMoney }				from '$data/money'
	import { monthLabel }				from '$data/date'
	import { investMensuelTotal }		from '$data/invest'
	import type { depense }				from '$data/types'
	import {
		db, byOrdre, create, edit, moveDepense, moveDepenseGroup, nextOrdre, remove, removeDepense, removeDepenseGroup
	} from '$data/store.svelte'

	interface stat
	{
		label:	string;
		value:	string;
	}

	/* Glissement en cours. `ordre` : place visée dans la liste cible, élément glissé exclu. */
	interface drag
	{
		kind:		'depense' | 'group';
		id:			number;
		idGroup:	number;	/* section visée ; pour une section, son propre id */
		ordre:		number;
	}

	/* Couleur de la ligne Investissement, hors palette des catégories. */
	const INVEST_COLOR		= displayColor('7c5cd6')
	const CATEGORY_COLORS	= ['7c5cd6', 'e08a3c', '3c8ae0', 'd6485c', '3ab08a']

	/* Une nouvelle ligne est créée avec un libellé vide : ces textes servent de placeholder,
	   et d'intitulé de repli tant que rien n'est saisi. Plus rien à effacer avant de taper. */
	const REVENU_PLACEHOLDER	= 'Nouveau revenu'
	const GROUP_PLACEHOLDER		= 'Nouvelle catégorie'
	const DEPENSE_PLACEHOLDER	= 'Nouvelle dépense'

	const revenus	= $derived(byOrdre(db.REVENU))
	const groups	= $derived(byOrdre(db.DEPENSE_GROUP))

	let dragging: drag | null				= $state(null)
	let openGroups: Record<number, boolean>	= $state({})

	/* Id de la ligne devant laquelle tombe l'élément glissé ; null : fin de liste. */
	const dropBefore = $derived.by(() =>
	{
		if (!dragging) return null

		const { kind, id, idGroup, ordre } = dragging
		if (kind === 'group')
			return groups.filter((group) => group.id_depense_group !== id)[ordre]?.id_depense_group ?? null
		return depensesOf(idGroup).filter((row) => row.id_depense !== id)[ordre]?.id_depense ?? null
	})

	const totalRevenu = $derived.by(() =>
	{
		let total = 0
		for (const row of db.REVENU)
			total += row.valeur ?? 0
		return roundMoney(total)
	})

	const depenseTotals = $derived.by(() =>
	{
		const totals: Record<number, number> = {}
		for (const row of db.DEPENSE)
			totals[row.id_depense_group] = roundMoney((totals[row.id_depense_group] ?? 0) + (row.valeur ?? 0))
		return totals
	})

	const totalDepenses = $derived.by(() =>
	{
		let total = 0
		for (const row of db.DEPENSE)
			total += row.valeur ?? 0
		return roundMoney(total)
	})

	const investMensuel	= $derived(investMensuelTotal(db.PROFIL_INVEST, db.ACTION))
	const reste			= $derived(roundMoney(totalRevenu - totalDepenses - investMensuel))

	const stats: stat[] = $derived([
		{ label: "Taux d'épargne",	value: `${totalRevenu > 0 ? roundMoney((investMensuel / totalRevenu) * 100) : 0} %` },
		{ label: 'Dépenses / mois',	value: formatAmount(totalDepenses) },
		{ label: 'Investi / an',	value: formatAmount(roundMoney(investMensuel * 12)) },
		{ label: 'Revenus / an',	value: formatAmount(roundMoney(totalRevenu * 12)) }
	])

	function depensesOf(idGroup: number): depense[]
	{
		const rows: depense[] = []
		for (const row of db.DEPENSE)
			if (row.id_depense_group === idGroup) rows.push(row)
		return byOrdre(rows)
	}

	function addRevenu(): void
	{
		void create('REVENU', '/revenus', { label: '', valeur: null, ordre: nextOrdre(db.REVENU) })
	}

	function removeRevenu(id: number): void
	{
		remove(db.REVENU, (row) => row.id_revenu === id, '/revenus', id)
	}

	/* `ordre` n'est pas envoyé : le serveur place la ligne en fin de liste. */
	function addGroup(): void
	{
		void create('DEPENSE_GROUP', '/depense-groups', {
			label:		'',
			couleur:	CATEGORY_COLORS[(db.DEPENSE_GROUP.length + 1) % CATEGORY_COLORS.length]
		})
	}

	function addDepense(idGroup: number): void
	{
		void create('DEPENSE', '/depenses', {
			label:				'',
			valeur:				null,
			id_depense_group:	idGroup
		})
	}

	/* Seule la poignée démarre un glissement : le reste de la ligne continue de faire défiler.
	   La capture garde les événements du pointeur sur la poignée jusqu'au relâchement. */
	function startDrag(event: PointerEvent & { currentTarget: HTMLElement }, kind: drag['kind'], id: number, idGroup: number, ordre: number): void
	{
		event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		dragging = { kind, id, idGroup, ordre }
	}

	function moveDrag(event: PointerEvent): void
	{
		if (!dragging) return

		if (dragging.kind === 'group') dragging.ordre = groupTarget(event.clientY)
		else Object.assign(dragging, depenseTarget(event.clientY))
	}

	function endDrag(): void
	{
		if (!dragging) return

		const { kind, id, idGroup, ordre } = dragging
		dragging = null

		if (kind === 'group')
		{
			const group = db.DEPENSE_GROUP.find((row) => row.id_depense_group === id)
			if (group) moveDepenseGroup(group, ordre)
			return
		}
		const row = db.DEPENSE.find((other) => other.id_depense === id)
		if (row) moveDepense(row, idGroup, ordre)
	}

	/* Blocs des sections dans l'ordre affiché, retrouvés par leur poignée. */
	function groupElements(): { id: number; element: HTMLElement }[]
	{
		const elements: { id: number; element: HTMLElement }[] = []
		for (const handle of document.querySelectorAll<HTMLElement>('[data-group]'))
		{
			const element = handle.closest('details')
			if (element) elements.push({ id: Number(handle.dataset.group), element })
		}
		return elements
	}

	/* Le milieu de la ligne est au-dessus du pointeur : la place visée est après elle. */
	function isAbove(element: HTMLElement, y: number): boolean
	{
		const rect = element.getBoundingClientRect()
		return y > rect.top + rect.height / 2
	}

	function groupTarget(y: number): number
	{
		let ordre = 0
		for (const { id, element } of groupElements())
			if (id !== dragging?.id && isAbove(element, y)) ordre++
		return ordre
	}

	/* Section : la dernière dont le haut est au-dessus du pointeur (la première sinon).
	   Place : parmi ses dépenses si elle est ouverte, en fin de liste si elle est repliée. */
	function depenseTarget(y: number): { idGroup: number; ordre: number }
	{
		const id		= dragging?.id ?? 0
		const sections	= groupElements()
		let target		= sections[0]
		for (const section of sections)
			if (section.element.getBoundingClientRect().top <= y) target = section

		if (!openGroups[target.id])
			return { idGroup: target.id, ordre: depensesOf(target.id).filter((row) => row.id_depense !== id).length }

		let ordre = 0
		for (const row of target.element.querySelectorAll<HTMLElement>('[data-depense]'))
			if (Number(row.dataset.depense) !== id && isAbove(row, y)) ordre++
		return { idGroup: target.id, ordre }
	}
</script>

<svelte:head><title>Budget — mycount</title></svelte:head>

<section class="hero">
	<span class="kicker">{monthLabel(new Date())}</span>
	<h1>Mon budget</h1>
</section>

<div class="stack">
	<Tile>
		<Disclosure title="Revenus mensuels" value={formatAmount(totalRevenu)}>
			{#each revenus as row (row.id_revenu)}
				<div class="edit-row">
					<input
						class="input"
						aria-label="Libellé du revenu"
						placeholder={REVENU_PLACEHOLDER}
						bind:value={() => row.label, (label) => edit(row, 'label', label, '/revenus', row.id_revenu)}
					/>
					<AmountInput
						label="Montant {row.label}"
						bind:value={() => row.valeur, (amount) => edit(row, 'valeur', amount ?? null, '/revenus', row.id_revenu)}
					/>
					<button class="btn danger" type="button" aria-label="Supprimer {row.label}" onclick={() => removeRevenu(row.id_revenu)}>×</button>
				</div>
			{/each}
			<button class="btn add" type="button" onclick={addRevenu}>+ Ajouter un revenu</button>
		</Disclosure>

		{#if investMensuel !== 0}
			<ValueRow label="Investissement" value={formatAmount(investMensuel)} color={INVEST_COLOR} />
		{/if}
		{#each groups as group (group.id_depense_group)}
			<ValueRow label={group.label || GROUP_PLACEHOLDER} value={formatAmount(depenseTotals[group.id_depense_group] ?? 0)} color={displayColor(group.couleur)} />
		{/each}
	</Tile>

	<StatTile label="Reste" value={formatAmount(reste)} emphasis />

	<TileGrid items={stats} min="150px">
		{#snippet tile(item: stat)}
			<StatTile label={item.label} value={item.value} />
		{/snippet}
	</TileGrid>
</div>

<!-- Dessin de la poignée (2 × 3 points), indépendant de la police. -->
{#snippet grip()}
	<svg class="grip" viewBox="0 0 7 11" aria-hidden="true">
		<circle cx="1.5" cy="1.5" r="1" /><circle cx="5.5" cy="1.5" r="1" />
		<circle cx="1.5" cy="5.5" r="1" /><circle cx="5.5" cy="5.5" r="1" />
		<circle cx="1.5" cy="9.5" r="1" /><circle cx="5.5" cy="9.5" r="1" />
	</svg>
{/snippet}

<Section title="Détail des dépenses · {formatAmount(totalDepenses)}">
	{#each groups as group (group.id_depense_group)}
		{#if dragging?.kind === 'group' && dropBefore === group.id_depense_group}
			<div class="drop"></div>
		{/if}
		<Disclosure
			title={group.label || GROUP_PLACEHOLDER}
			value={formatAmount(depenseTotals[group.id_depense_group] ?? 0)}
			color={displayColor(group.couleur)}
			bind:open={() => openGroups[group.id_depense_group] ?? false, (open) => (openGroups[group.id_depense_group] = open)}
		>
			{#snippet handle()}
				<!-- Le clic qui suit le relâchement ne doit pas replier la section. -->
				<span
					class="handle"
					class:dragged={dragging?.kind === 'group' && dragging.id === group.id_depense_group}
					aria-hidden="true"
					data-group={group.id_depense_group}
					onpointerdown={(event) => startDrag(event, 'group', group.id_depense_group, group.id_depense_group, group.ordre)}
					onpointermove={moveDrag}
					onpointerup={endDrag}
					onpointercancel={() => (dragging = null)}
					onclick={(event) => event.preventDefault()}
				>{@render grip()}</span>
			{/snippet}

			<label class="field group-name">
				<span>Nom de la catégorie</span>
				<input
					class="input"
					placeholder={GROUP_PLACEHOLDER}
					bind:value={() => group.label, (label) => edit(group, 'label', label, '/depense-groups', group.id_depense_group)}
				/>
			</label>

			{#each depensesOf(group.id_depense_group) as row (row.id_depense)}
				{#if dragging?.kind === 'depense' && dragging.idGroup === group.id_depense_group && dropBefore === row.id_depense}
					<div class="drop"></div>
				{/if}
				<div class="edit-row" class:dragged={dragging?.kind === 'depense' && dragging.id === row.id_depense} data-depense={row.id_depense}>
					<span
						class="handle"
						aria-hidden="true"
						onpointerdown={(event) => startDrag(event, 'depense', row.id_depense, group.id_depense_group, row.ordre)}
						onpointermove={moveDrag}
						onpointerup={endDrag}
						onpointercancel={() => (dragging = null)}
					>{@render grip()}</span>
					<input
						class="input"
						aria-label="Libellé de la dépense"
						placeholder={DEPENSE_PLACEHOLDER}
						bind:value={() => row.label, (label) => edit(row, 'label', label, '/depenses', row.id_depense)}
					/>
					<AmountInput
						label="Montant {row.label}"
						color={displayColor(group.couleur)}
						bind:value={() => row.valeur, (amount) => edit(row, 'valeur', amount ?? null, '/depenses', row.id_depense)}
					/>
					<button class="btn danger" type="button" aria-label="Supprimer {row.label}" onclick={() => removeDepense(row)}>×</button>
				</div>
			{/each}
			{#if dragging?.kind === 'depense' && dragging.idGroup === group.id_depense_group && dropBefore === null}
				<div class="drop"></div>
			{/if}

			<div class="actions">
				<button class="btn add" type="button" onclick={() => addDepense(group.id_depense_group)}>+ Ajouter une dépense</button>
				<button class="btn danger" type="button" onclick={() => removeDepenseGroup(group)}>Supprimer la catégorie</button>
			</div>
		</Disclosure>
		<!-- Section repliée : son contenu est masqué, la place visée (fin de liste) se montre sous elle. -->
		{#if dragging?.kind === 'depense' && dragging.idGroup === group.id_depense_group && !openGroups[group.id_depense_group]}
			<div class="drop"></div>
		{/if}
	{/each}
	{#if dragging?.kind === 'group' && dropBefore === null}
		<div class="drop"></div>
	{/if}

	<div class="actions">
		<button class="btn add" type="button" onclick={addGroup}>+ Ajouter une catégorie</button>
	</div>
</Section>

<style>
	/* Alignement sur le bas : les traits sous le libellé et sous le montant tombent sur
	   la même ligne, quelle que soit la hauteur propre de chaque champ. */
	.edit-row {
		display:		flex;
		align-items:	flex-end;
		gap:			var(--space-4);
		padding:		var(--space-2) 0;
	}

	/* Sans retrait horizontal : le « + » s'aligne sur le bord gauche des champs. */
	.add {
		padding-inline: 0;
	}

	.edit-row .input {
		flex: 1;
	}

	/* Poignée sur la ligne de base du libellé : l'input, plus haut élément de la ligne, reste
	   collé en bas (soulignement inchangé), la poignée s'aligne sur son texte. */
	.edit-row .input,
	.edit-row .handle {
		align-self: baseline;
	}

	.group-name {
		margin-bottom: var(--space-4);
	}

	/* touch-action sur la poignée seule : ailleurs, le doigt fait toujours défiler la page. */
	.handle {
		touch-action: none;
	}

	/* En ligne, posée sur la ligne de base et haute de 1cap : couvre la hauteur des capitales,
	   comme le libellé voisin. Événements laissés à la poignée qui la contient. */
	.grip {
		height:			1cap;
		fill:			currentColor;
		pointer-events:	none;
	}

	/* Élément glissé : la ligne, ou la section entière depuis sa poignée. */
	.edit-row.dragged,
	:global(details:has(> summary .dragged)) {
		opacity: 0.5;
	}

	/* Place où tombera l'élément glissé. */
	.drop {
		border-top: 1px solid var(--color-accent);
	}
</style>
