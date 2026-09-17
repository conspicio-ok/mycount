<script lang="ts">
	import '$lib/styles/app.css'
	import Container		from '$lib/layout/Container.svelte'
	import favicon			from '$lib/assets/favicon.svg'
	import { page }			from '$app/state'
	import { resolve }		from '$app/paths'
	import { afterNavigate }	from '$app/navigation'
	import { session, sync, flushEdits }	from '$data/store.svelte'

	let { children } = $props()

	const LINKS = [
		{ href: resolve('/'),			label: 'Budget' },
		{ href: resolve('/investir'),	label: 'Investir' },
		{ href: resolve('/suivi'),		label: 'Suivi' },
		{ href: resolve('/projection'),	label: 'Projection' }
	]

	/* Le bandeau d'erreur appartient à la page qui l'a déclenché : changer de page l'efface.
	   Pas au premier affichage (`from` nul), sinon une erreur levée pendant la vérification
	   de session, comme « Serveur injoignable », disparaîtrait avant d'être lue. */
	afterNavigate(({ from }) =>
	{
		if (from) sync.error = null
	})
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window onpagehide={flushEdits} />

<Container>
	<header>
		<a class="brand" href={resolve('/')}>mycount</a>

		{#if session.user}
			<nav>
				{#each LINKS as link (link.href)}
					<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>{link.label}</a>
				{/each}
				<a
					href={resolve('/compte')}
					aria-current={page.url.pathname === resolve('/compte') ? 'page' : undefined}
				>{session.user.pseudo}</a>
			</nav>
		{/if}
	</header>

	{#if sync.error}
		<div class="sync-error" role="alert">
			<span>{sync.error}</span>
			<button class="btn" type="button" aria-label="Fermer" onclick={() => (sync.error = null)}>×</button>
		</div>
	{/if}

	<main>
		{@render children()}
	</main>
</Container>

<style>
	header {
		display:		flex;
		flex-wrap:		wrap;
		align-items:	baseline;
		gap:			12px 24px;
		padding:		clamp(12px, 4vw, 32px) 0;
	}

	.brand {
		font-family:	var(--font-heading);
		font-weight:	var(--font-heading-weight);
		font-size:		15px;
		letter-spacing:	-0.01em;
		color:			var(--color-text);
	}

	nav {
		display:		flex;
		flex-wrap:		wrap;
		gap:			10px 18px;
		margin-left:	auto;
		font-size:		14px;
	}

	nav a {
		color: var(--color-neutral-400);
	}

	nav a:hover,
	nav a[aria-current='page'] {
		color: var(--color-accent-300);
	}

	.sync-error {
		display:			flex;
		align-items:		center;
		justify-content:	space-between;
		gap:				var(--space-4);
		padding:			var(--space-3) var(--space-6);
		border:				1px solid #d6485c;
		border-radius:		var(--radius-md);
		background:			color-mix(in oklab, #d6485c 15%, transparent);
		font-size:			14px;
	}

	main {
		padding-bottom: clamp(48px, 10vw, 96px);
	}
</style>
