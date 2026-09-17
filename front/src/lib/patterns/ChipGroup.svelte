<!--
	@component
	Choix exclusif parmi quelques options, en pastilles. Défile horizontalement
	quand la place manque, plutôt que de passer à la ligne.
	@example
	```html
	<ChipGroup
		label="Enveloppe"
		options={[{ value: 1, label: 'PEA', color: '#3c8ae0' }]}
		bind:value={selected}
	/>
	```
-->
<script lang="ts" generics="V extends string | number">
	interface ChipOption
	{
		value:	V;
		label:	string;
		color?:	string;
	}

	interface ChipGroupProps
	{
		label:		string;
		options:	ChipOption[];
		value:		V;
		wrap?:		boolean;
	}

	let { label, options, value = $bindable(), wrap = false }: ChipGroupProps = $props()
</script>

<div class="chips" class:wrap role="radiogroup" aria-label={label}>
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			class="chip"
			class:active={option.value === value}
			aria-checked={option.value === value}
			style:--chip-color={option.color}
			onclick={() => (value = option.value)}
		>{option.label}</button>
	{/each}
</div>

<style>
	.chips {
		display:			flex;
		gap:				var(--space-3);
		overflow-x:			auto;
		padding-bottom:		var(--space-1);
		scrollbar-width:	none;
	}

	.wrap {
		flex-wrap:	wrap;
		overflow-x:	visible;
	}

	.chip {
		flex:			none;
		padding:		var(--space-2) var(--space-4);
		border:			1px solid color-mix(in oklab, var(--chip-color, var(--color-accent-500)) 45%, transparent);
		border-radius:	var(--radius-md);
		background:		transparent;
		color:			var(--color-neutral-300);
		font:			inherit;
		font-size:		13px;
		cursor:			pointer;
	}

	.chip:hover {
		border-color: var(--chip-color, var(--color-accent-400));
	}

	.active {
		border-color:	var(--chip-color, var(--color-accent-400));
		background:		color-mix(in oklab, var(--chip-color, var(--color-accent-500)) 30%, transparent);
		color:			var(--color-text);
	}
</style>
