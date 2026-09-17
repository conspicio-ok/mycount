<script lang="ts" generics="T">
	import type { Snippet } from 'svelte'

	/* Grille de tuiles. Le pendant de CardGrid, mais pour des blocs autonomes :
	   là où CardGrid colle ses cartes pour que le fond apparaisse en filets d'un
	   pixel, ici chaque tuile porte son propre contour et réclame un écart.

	   `tile` est un snippet : la grille ne connaît pas la forme de ce qu'elle
	   dispose, seulement combien de place lui donner. */
	let { items, tile, after, min = '260px' }: {
		items: T[]
		tile:  Snippet<[T]>
		after?: Snippet
		min?:  string
	} = $props()
</script>

<div class="grid" style:--grid-min={min}>
	{#each items as item (item)}
		{@render tile(item)}
	{/each}

	{#if after}
		{@render after()}
	{/if}
</div>

<style>
	.grid {
		display:               grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--grid-min)), 1fr));
		gap:                   var(--space-4);
	}
</style>
