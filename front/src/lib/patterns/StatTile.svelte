<!--
	@component
	Chiffre clé posé sur une Tile : petit libellé en capitales, grande valeur dessous.
	@example
	```html
	<StatTile label="Taux d'épargne" value="12,4 %" color="#3c8ae0" emphasis />
	```
-->
<script lang="ts">
	import Tile from './Tile.svelte'

	interface StatTileProps
	{
		label:		string;
		value:		string;
		color?:		string;
		emphasis?:	boolean;
	}

	let { label, value, color, emphasis = false }: StatTileProps = $props()
</script>

<Tile padding="var(--space-6) var(--space-8)">
	<span class="label">{label}</span>
	<span class="value" class:emphasis style:color>{value}</span>
</Tile>

<style>
	.label {
		display:		block;
		font-size:		11px;
		letter-spacing:	0.08em;
		text-transform:	uppercase;
		color:			var(--color-neutral-500);
	}

	.value {
		display:				block;
		margin-top:				var(--space-2);
		font-family:			var(--font-heading);
		font-size:				22px;
		font-variant-numeric:	tabular-nums;
		letter-spacing:			-0.015em;
	}

	.emphasis {
		font-size:	clamp(28px, 6vw, 36px);
		color:		var(--color-accent-300);
	}
</style>
