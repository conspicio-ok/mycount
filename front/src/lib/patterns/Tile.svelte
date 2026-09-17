<script lang="ts">
	import type { Snippet } from 'svelte'

	/* Tuile générique : un bloc de la couleur du fond, délimité par un trait d'un
	   pixel, à angles vifs. Contrairement à CardGrid — qui sépare ses cartes par
	   des filets partagés — la tuile est autonome et vit hors grille. */
	let {
		href,
		padding = 'clamp(20px, 4vw, 30px) clamp(18px, 3.5vw, 28px)',
		children
	}: {
		href?:    string
		padding?: string
		children: Snippet
	} = $props()
</script>

<svelte:element
	this={href ? 'a' : 'div'}
	{href}
	class="tile"
	style:--tile-padding={padding}
>
	{@render children()}
</svelte:element>

<style>
	.tile {
		position:   relative;
		display:    block;
		padding:    var(--tile-padding);
		background: var(--color-bg);
		color:      var(--color-text);

		/* Ni rayon ni ombre : la séparation d'avec le fond tient au seul trait du
		   contour, ci-dessous. Angles vifs assumés. */
	}

	/* Bordure mauve d'un pixel. Technique du masque : le pseudo-élément est rempli
	   d'un dégradé, puis deux masques superposés — l'un limité à la boîte de
	   contenu, l'autre à la boîte de bordure — s'annulent par `exclude`. Seul le
	   padding survit, c'est-à-dire un trait d'un pixel sur les quatre côtés. Un
	   `border` ne saurait pas porter ce dégradé.

	   Le dégradé descend du mauve clair au mauve sombre : le contour s'éteint vers
	   le bas, ce qui suffit à donner du volume sans mouvement. */
	.tile::before {
		content:        '';
		position:       absolute;
		inset:          0;
		padding:        1px;
		pointer-events: none;

		background: linear-gradient(to bottom,
		            color-mix(in oklab, var(--color-accent-400) 60%, transparent),
		            color-mix(in oklab, var(--color-accent-600) 30%, transparent));

		-webkit-mask: linear-gradient(#000 0 0) content-box,
		              linear-gradient(#000 0 0);
		        mask: linear-gradient(#000 0 0) content-box,
		              linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		        mask-composite: exclude;

		opacity:    0.75;
		transition: opacity 0.4s ease;
	}

	.tile:hover::before {
		opacity: 1;
	}
</style>
