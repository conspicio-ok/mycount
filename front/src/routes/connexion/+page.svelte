<script lang="ts">
	import Tile				from '$lib/patterns/Tile.svelte'
	import { goto }			from '$app/navigation'
	import { resolve }		from '$app/paths'
	import { authenticate }	from '$data/store.svelte'
	import { errorMessage }	from '$data/errors'
	import { api }			from '$data/api'

	type Mode = 'login' | 'signup'

	/* Mêmes bornes que l'API (core/auth/auth.go) : garder les deux en phase. */
	const MIN_PASSWORD_LENGTH	= 8
	const MAX_PASSWORD_BYTES	= 1024
	const PSEUDO_PATTERN		= /^[A-Za-z0-9_.-]{3,32}$/
	const MODE_OPTIONS: { value: Mode; label: string }[] = [
		{ value: 'login',	label: 'Connexion' },
		{ value: 'signup',	label: 'Inscription' }
	]

	/* Générique explicite : avec une simple annotation, TypeScript garde le type étroit
	   'login' de la valeur initiale et juge `mode === 'signup'` impossible. */
	let mode					= $state<Mode>('login')
	let pseudo					= $state('')
	let password				= $state('')
	let passwordConfirm			= $state('')
	let error: string | null	= $state(null)
	let submitting				= $state(false)
	/* Inscription ouverte seulement tant que la base n'a aucun compte (premier admin). Fermée
	   par défaut : l'onglet n'apparaît qu'une fois l'ouverture confirmée par l'API. */
	let signupOpen				= $state(false)

	const modeOptions = $derived.by(() =>
	{
		const options: { value: Mode; label: string }[] = []
		for (const option of MODE_OPTIONS)
			if (option.value === 'login' || signupOpen) options.push(option)
		return options
	})

	$effect(() =>
	{
		async function loadSignupStatus(): Promise<void>
		{
			try { signupOpen = (await api<{ open: boolean }>('GET', '/auth/signup')).open }
			catch { signupOpen = false }
		}
		void loadSignupStatus()
	})

	/* Affiché dès que la confirmation est commencée, sans attendre l'envoi. */
	const mismatch = $derived(mode === 'signup' && passwordConfirm !== '' && password !== passwordConfirm)

	/* Vérifications avant envoi, dans l'ordre de l'API. La longueur se compte en caractères
	   (un emoji vaut 1), la borne haute en octets UTF-8, comme côté serveur. */
	function validate(): string | null
	{
		if (mode === 'login') return null

		if (!PSEUDO_PATTERN.test(pseudo.trim())) return 'Pseudo invalide : 3 à 32 caractères, lettres, chiffres, _ - . uniquement.'
		if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'Mot de passe trop long.'
		if ([...password].length < MIN_PASSWORD_LENGTH) return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`
		if (password !== passwordConfirm) return 'Les mots de passe ne correspondent pas.'
		return null
	}

	/* Une erreur appartient au mode qui l'a produite : elle disparaît au changement. */
	function selectMode(next: Mode): void
	{
		mode	= next
		error	= null
	}

	async function submit(event: SubmitEvent): Promise<void>
	{
		event.preventDefault()
		if (submitting) return

		error = validate()
		if (error) return

		submitting = true
		try
		{
			await authenticate(mode, pseudo.trim(), password, passwordConfirm)
			await goto(resolve('/'))
		}
		catch (caught)
		{
			error = errorMessage(caught)
		}
		finally
		{
			submitting = false
		}
	}
</script>

<svelte:head><title>Connexion — mycount</title></svelte:head>

<div class="login">
	<section class="hero">
		<!-- Le titre sert de sélecteur : un bouton par mode, le mode actif reste en clair. -->
		<h1 class="modes">
			{#each modeOptions as option (option.value)}
				<button
					class="mode"
					class:active={option.value === mode}
					type="button"
					aria-pressed={option.value === mode}
					onclick={() => selectMode(option.value)}
				>{option.label}</button>
			{/each}
		</h1>
	</section>

	<div class="panel">
		<Tile>
			<form onsubmit={submit}>
				<label class="field">
					<span>Pseudo</span>
					<input
						class="input"
						type="text"
						autocomplete="username"
						autocapitalize="none"
						spellcheck="false"
						maxlength="32"
						required
						bind:value={pseudo}
					/>
				</label>

				<label class="field">
					<span>Mot de passe</span>
					<input
						class="input"
						type="password"
						autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
						minlength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
						required
						bind:value={password}
					/>
				</label>

				{#if mode === 'signup'}
					<label class="field">
						<span>Confirmer le mot de passe</span>
						<input
							class="input"
							type="password"
							autocomplete="new-password"
							required
							aria-invalid={mismatch}
							aria-describedby={mismatch ? 'password-mismatch' : undefined}
							bind:value={passwordConfirm}
						/>
						{#if mismatch}
							<small id="password-mismatch" class="hint">Les mots de passe ne correspondent pas.</small>
						{/if}
					</label>
				{/if}

				{#if error}
					<p class="error" role="alert">{error}</p>
				{/if}

				<button class="btn submit" type="submit" disabled={submitting}>
					{mode === 'login' ? 'Se connecter' : 'Créer le compte'}
				</button>
			</form>
		</Tile>
	</div>
</div>

<style>
	/* Centré dans la hauteur restante sous l'en-tête, sur les deux axes. */
	.login {
		display:			flex;
		flex-direction:		column;
		align-items:		center;
		justify-content:	center;
		min-height:			70vh;
	}

	/* Titre et tuile partagent la même largeur : le titre s'aligne sur le bord gauche de la tuile. */
	.hero,
	.panel {
		width:		100%;
		max-width:	380px;
	}

	form {
		display:		flex;
		flex-direction:	column;
		gap:			var(--space-8);
	}

	.error,
	.hint {
		margin:	0;
		color:	#f0a8b3;
	}

	.hint {
		font-size: 12px;
	}

	.input[aria-invalid='true'] {
		border-bottom-color: #d6485c;
	}

	.modes {
		display:	flex;
		flex-wrap:	wrap;
		gap:		0 var(--space-8);
	}

	/* Boutons remis à plat : ils héritent de la typographie du titre. */
	.mode {
		padding:	0;
		border:		0;
		background:	transparent;
		color:		var(--color-neutral-500);
		font:		inherit;
		cursor:		pointer;
		transition:	color 0.2s ease;
	}

	.mode:hover {
		color: var(--color-neutral-300);
	}

	.mode.active {
		color: var(--color-text);
	}

	@media (prefers-reduced-motion: reduce) {
		.mode {
			transition: none;
		}
	}

	.submit {
		align-self: flex-end;
	}
</style>
