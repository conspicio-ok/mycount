<!--
	@component
	Champ numérique avec unité en suffixe. Vide = null, et le placeholder s'affiche :
	on distingue ainsi « non saisi » de « zéro ».
	@example
	```html
	<AmountInput label="Loyer" unit="€" placeholder="0" color="#e08a3c" bind:value={depense.valeur} />
	```
-->
<script lang="ts">
	interface AmountInputProps
	{
		label:			string;
		value:			number | null | undefined;
		unit?:			string;
		placeholder?:	string;
		color?:			string;
	}

	let { label, value = $bindable(), unit = '€', placeholder = '0', color }: AmountInputProps = $props()
</script>

<label class="amount" style:--amount-color={color}>
	<input type="number" step="any" inputmode="decimal" aria-label={label} {placeholder} bind:value />
	<span class="unit">{unit}</span>
</label>

<style>
	.amount {
		display:		inline-flex;
		align-items:	baseline;
		gap:			var(--space-1);
		border-bottom:	1px solid var(--amount-color, var(--color-neutral-800));
	}

	.amount:focus-within {
		border-bottom-color: var(--color-accent-400);
	}

	input {
		width:					7ch;
		padding:				var(--space-1) 0;
		border:					0;
		background:				transparent;
		color:					var(--color-text);
		font:					inherit;
		font-variant-numeric:	tabular-nums;
		text-align:				right;
		appearance:				textfield;
	}

	input::-webkit-inner-spin-button,
	input::-webkit-outer-spin-button {
		appearance:	none;
		margin:		0;
	}

	input::placeholder {
		color: var(--color-neutral-800);
	}

	input:focus-visible {
		outline: none;
	}

	.unit {
		font-size:	12px;
		color:		var(--color-neutral-500);
	}
</style>
