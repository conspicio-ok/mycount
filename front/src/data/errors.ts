import { ApiError } from './api'

/* L'API renvoie des clés, jamais de texte : le choix du message reste côté front. */
const MESSAGES: Record<string, string> = {
	'auth.error.invalidCredentials':	'Pseudo ou mot de passe incorrect.',
	'auth.error.invalidPseudo':			'Pseudo invalide : 3 à 32 caractères, lettres, chiffres, _ - . uniquement.',
	'auth.error.passwordWeak':			'Le mot de passe doit contenir au moins 8 caractères.',
	'auth.error.passwordTooLong':		'Mot de passe trop long.',
	'auth.error.passwordMismatch':		'Les mots de passe ne correspondent pas.',
	'auth.error.pseudoAlreadyExists':	'Ce pseudo est déjà pris.',
	'auth.error.tooManyAttempts':		'Trop de tentatives, réessayez dans 5 minutes.',
	'auth.error.signupClosed':			'Inscription fermée : demandez un compte à un administrateur.',
	'auth.error.currentPassword':		'Mot de passe actuel incorrect.',
	'errors.constraint':				'Valeur refusée par la base de données.',
	'errors.notFound':					'Élément introuvable, les données ont été rechargées.',
	'errors.network':					'Serveur injoignable.',
	'errors.database':					'Erreur de la base de données.',
	'errors.notEnoughParts':			'Vente refusée : plus de parts que détenues.',
	'errors.uniqueViolation':			'Existe déjà.',
	'errors.forbidden':					'Action non autorisée pour ce compte.',
	'errors.selfRole':					'Impossible de changer son propre rôle.',
	'errors.selfArchive':				'Impossible de supprimer son propre compte.',
	'errors.invalidBody':				'Requête invalide.',
	'errors.missingField':				'Champ manquant.'
}

export function errorMessage(error: unknown): string
{
	if (error instanceof ApiError) return MESSAGES[error.key] ?? `Erreur inattendue (${error.key}).`
	return 'Erreur inattendue.'
}
