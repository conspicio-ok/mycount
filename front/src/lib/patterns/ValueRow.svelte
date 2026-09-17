<!--
	@component
	Ligne libellé / valeur, avec pastille optionnelle. Les lignes consécutives
	se séparent d'un filet.
	@example
	```html
	<ValueRow label="Logement" value="821,5 €" color="#e08a3c" tone="accent" />
	```
-->
<script lang="ts">
	import Dot from './Dot.svelte'

	interface ValueRowProps
	{
		label:	string;
		value:	string;
		color?:	string;
		tone?:	'default' | 'accent' | 'muted';
	}

	let { label, value, color, tone = 'default' }: ValueRowProps = $props()
</script>

<div class="row value-row">
	<span class="label">
		{#if color}
			<Dot {color} />
		{/if}
		{label}
	</span>
	<span class="value {tone}">{value}</span>
</div>

<style>
	.row {
		display:				flex;
		align-items:			baseline;
		justify-content:		space-between;
		gap:					var(--space-6);
		padding:				var(--space-4) 0;
		font-variant-numeric:	tabular-nums;
	}

	/* Deux lignes voisines sont deux instances du composant : le compilateur ne peut
	   pas voir le voisinage, d'où le sélecteur global sur une classe dédiée. */
	:global(.value-row + .value-row) {
		border-top: 1px solid var(--color-neutral-900);
	}

	.label {
		display:		inline-flex;
		align-items:	center;
		gap:			var(--space-3);
		min-width:		0;
		color:			var(--color-neutral-300);
	}

	.value {
		font-weight: 500;
	}

	.accent {
		color: var(--color-accent-300);
	}

	.muted {
		color: var(--color-neutral-500);
	}
</style>
