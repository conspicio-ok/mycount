<script lang="ts">
	import type { Snippet } from 'svelte'

	let { children, width = 'clamp(72%, 108% - 5.01vw, 90%)' }: {
		children: Snippet
		width?:   string
	} = $props()
</script>

<div class="container" style:--container-width={width}>
	{@render children()}
</div>

<style>
	.container {
		max-width: var(--container-width);
		margin:    0 auto;
		padding:   0 clamp(18px, 5vw, 32px);
	}
</style>
