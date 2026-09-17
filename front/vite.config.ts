import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		// Le navigateur ne parle qu'au serveur Vite : l'API est servie sur la même origine,
		// donc les cookies SameSite=Strict passent et aucun CORS n'est nécessaire.
		proxy: {
			'/api': {
				target: process.env.API_URL ?? 'http://localhost:8080',
				changeOrigin: true,
				// Ajoute X-Forwarded-For : l'API bannit par IP du client, pas par IP du proxy.
				xfwd: true,
				rewrite: (path) => path.replace(/^\/api/, '')
			}
		}
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SPA : les données viennent de l'API Go à l'exécution, rien à prérendre.
			// Toute route inconnue du serveur statique retombe sur index.html.
			adapter: adapter({ fallback: 'index.html' }),
			// Données et calculs propres à mycount : hors de $lib, qui reste transposable.
			alias: {
				$data: 'src/data'
			}
		})
	]
});
