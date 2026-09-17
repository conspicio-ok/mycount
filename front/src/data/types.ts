/* Contrat de données : miroir des tables du MCD, au format de sauvegarde v1.
   Alimenté par l'API Go (GET /data). */

export type role = 'user' | 'admin' | 'bloque'

export interface user
{
	id:		number;
	pseudo:	string;
	role:	role;
}

export interface profilInvest
{
	id_profil_inv:		number;
	label:				string;
	taux:				number | null;
	style_acquisition:	string | null;	/* 'parts' ou 'montant' */
	couleur:			string | null;	/* hex sans # */
	archive_le:			string | null;	/* AAAA-MM-JJ ; archivée = masquée, journal conservé */
}

/* Catalogue commun. `prix` est le prix effectif de l'utilisateur : perso sinon commun. */
export interface marche
{
	id_marche:	number;
	label:		string;
}

export interface titre
{
	id_titre:	number;
	nom:		string;
	id_marche:	number;
	prix:		number | null;
	div:		number | null;	/* montant d'un versement, pas annuel */
	prix_perso:	number;			/* 0/1 : prix personnel (compte bloqué) */
}

/* Position : un titre dans une enveloppe. Nom, prix, dividende viennent du titre. */
export interface action
{
	id_action:		number;
	id_profil_inv:	number;
	id_titre:		number;
	ordre:			number;
	nb_part_acquis:	number | null;
	prix_inv:		number | null;
	nb_inv:			number | null;
	archive_le:		string | null;
}

export interface depenseGroup
{
	id_depense_group:	number;
	label:				string;
	ordre:				number;
	couleur:			string | null;
}

export interface depense
{
	id_depense:			number;
	label:				string;
	valeur:				number | null;
	ordre:				number;
	id_depense_group:	number;
}

export interface revenu
{
	id_revenu:	number;
	label:		string;
	valeur:		number | null;
	ordre:		number | null;
}

export interface versementDiv
{
	id_titre:	number;
	mois:		number;	/* 1 à 12 */
}

/* Achat ou vente validé ; ses parts sont déjà reportées sur action.nb_part_acquis. */
export interface mouvement
{
	id_mouvement:	number;
	id_action:		number;
	date:			string;			/* AAAA-MM-JJ */
	sens:			'achat' | 'vente';
	nb_part:		number;
	prix:			number | null;	/* prix unitaire */
}

export interface banned
{
	id_banned:	number;
	label:		string;
	texte:		string | null;
}

export interface backupTables
{
	PROFIL_INVEST:	profilInvest[];
	DEPENSE_GROUP:	depenseGroup[];
	REVENU:			revenu[];
	BANNED:			banned[];
	ACTION:			action[];
	DEPENSE:		depense[];
	VERSEMENT_DIV:	versementDiv[];
	MOUVEMENT:		mouvement[];
	MARCHE:			marche[];
	TITRE:			titre[];
}

export interface backup
{
	version:	number;
	exportedAt:	string;
	tables:		backupTables;
}
