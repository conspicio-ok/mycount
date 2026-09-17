<!--
	@component
	Bloc repliable : l'en-tête montre un titre et un total, le corps se déplie au clic.
	Construit sur <details>, donc accessible au clavier sans JS.
	@example
	```html
	<Disclosure title="Revenus mensuels" value="1 562,9 €" color="#3ab08a" bind:open>
		...
	</Disclosure>
	```
-->
<script lang="ts">
	import type { Snippet }	from 'svelte'
	import Dot				from './Dot.svelte'

	interface DisclosureProps
	{
		title:		string;
		value?:		string;
		color?:		string;
		open?:		boolean;
		handle?:	Snippet;	/* rendu en tête de l'en-tête, avant le chevron */
		children:	Snippet;
	}

	let { title, value, color, open = $bindable(false), handle, children }: DisclosureProps = $props()
</script>

<details class="disclosure" bind:open style:--disclosure-color={color}>
	<summary>
		{@render handle?.()}
		<svg class="chevron" viewBox="0 0 6 10" aria-hidden="true">
			<path d="M1 1 L5 5 L1 9" fill="none" stroke="currentColor" stroke-width="1.5" />
		</svg>
		{#if color}
			<Dot {color} />
		{/if}
		<span class="title">{title}</span>
		{#if value}
			<span class="value">{value}</span>
		{/if}
	</summary>

	<div class="body">
		{@render children()}
	</div>
</details>

<style>
	/* Le filet ne sépare que deux blocs de contenu : il est porté par l'élément qui suit
	   un bloc repliable (autre bloc ou ligne de valeur), jamais par le dernier élément.
	   Sélecteur global car le voisin est une autre instance, voire un autre composant. */
	:global(.disclosure + .disclosure),
	:global(.disclosure + .value-row) {
		border-top: 1px solid var(--color-neutral-900);
	}

	/* Alignement sur la ligne de base, et non sur le centre des boîtes : le centre d'une boîte
	   de ligne dépend des métriques de la police, pas du dessin. Chevron, poignée et pastille
	   sont des boîtes sans texte hautes de 1cap posées sur la ligne de base : elles couvrent
	   exactement la hauteur des capitales du libellé, donc se centrent sur lui. */
	summary {
		display:		flex;
		align-items:	baseline;
		gap:			var(--space-3);
		padding:		var(--space-6) 0;
		cursor:			pointer;
		list-style:		none;
	}

	/* Pastille plus petite que 1cap : la marge basse la remonte au centre des capitales
	   (la ligne de base d'une boîte sans texte est le bas de sa marge). */
	summary > :global(.dot) {
		margin-bottom: calc((1cap - var(--dot-size)) / 2);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	.chevron {
		flex:		none;
		width:		1ch;
		height:		1cap;	/* rotation autour du centre des capitales */
		color:		var(--color-neutral-500);
		transition:	transform 0.2s ease;
	}

	[open] .chevron {
		transform: rotate(90deg);
	}

	.title {
		flex:			1;
		min-width:		0;
		font-family:	var(--font-heading);
		font-weight:	var(--font-heading-weight);
		color:			var(--disclosure-color, var(--color-text));
	}

	.value {
		font-variant-numeric:	tabular-nums;
		font-weight:			500;
		color:					var(--disclosure-color, var(--color-accent-300));
	}

	.body {
		padding: 0 0 var(--space-6) calc(1ch + var(--space-3));
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
