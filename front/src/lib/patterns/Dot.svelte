<!--
	@component
	Pastille carrée aux angles adoucis : repère visuel d'une catégorie ou d'une enveloppe.
	@example
	```html
	<Dot color="#3c8ae0" size="10px" />
	```
-->
<script lang="ts">
	interface DotProps
	{
		color:	string;
		size?:	string;
	}

	let { color, size = '10px' }: DotProps = $props()
</script>

<span class="dot" style:--dot-color={color} style:--dot-size={size} aria-hidden="true"></span>

<style>
	.dot {
		display:		inline-block;
		flex:			none;
		width:			var(--dot-size);
		height:			var(--dot-size);
		border-radius:	3px;
		background:		var(--dot-color);
	}
</style>
