<script lang="ts">
	import type { Snippet } from 'svelte'

	/* `more` : lien de renvoi optionnel, affiché sous le contenu.
	   Sert aux aperçus de l'accueil qui renvoient vers la page complète.
	   `heading` : remplace le titre texte, pour un titre éditable par exemple.
	   `aside` : contenu placé à droite de la règle, sur la ligne du titre. */
	let { title = '', id, more, heading, aside, children }: {
		title?:   string
		id?:      string
		more?:    { href: string; label: string }
		heading?: Snippet
		aside?:   Snippet
		children: Snippet
	} = $props()
</script>

<section {id}>
	<div class="head">
		{#if heading}
			{@render heading()}
		{:else}
			<h2>{title}</h2>
		{/if}
		<span class="hr rule"></span>
		{@render aside?.()}
	</div>
	{@render children()}

	{#if more}
		<!-- L'appelant fournit un href déjà passé par resolve() : la lib ne connaît pas les routes. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="btn more" href={more.href}>{more.label}</a>
	{/if}
</section>

<style>
	section {
		padding:           0 0 clamp(64px, 12vw, 96px);
		scroll-margin-top: 40px;
	}

	.head {
		display:       flex;
		flex-wrap:     wrap;
		/* last baseline : un `aside` sur deux lignes (libellé + champ) aligne sa ligne
		   de champ sur le titre ; sans aside, identique à baseline. */
		align-items:   last baseline;
		gap:           var(--space-6);
		margin-bottom: var(--space-8);
	}

	h2 {
		margin:         0;
		font-size:      13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--color-neutral-500);
	}

	/* .hr porte le dégradé du design system ; on ne change que le flux. */
	.rule {
		flex:   1;
		margin: 0;
	}

	.more {
		margin-top: var(--space-6);
	}
</style>
