package handler

import "mycount/core/resource"

// Tables exposées en CRUD. Les clés de Columns sont les seules colonnes qu'un client
// peut écrire : id, id_utilisateur et colonne parent (hors création) en sont exclus,
// comme ordre pour une table Ordered (déplacement par la route /move).

var Revenu = resource.Spec{
	Table:    "REVENU",
	IDColumn: "id_revenu",
	Rooted:   true,
	Columns: map[string]resource.Kind{
		"label":  resource.Text,
		"valeur": resource.NullReal,
		"ordre":  resource.NullInteger,
	},
	Required: []string{"label"},
	Returned: "id_revenu, label, valeur, ordre",
}

var DepenseGroup = resource.Spec{
	Table:    "DEPENSE_GROUP",
	IDColumn: "id_depense_group",
	Rooted:   true,
	Ordered:  true,
	Columns: map[string]resource.Kind{
		"label":   resource.Text,
		"couleur": resource.NullText,
	},
	Required: []string{"label"},
	Returned: "id_depense_group, label, ordre, couleur",
}

var Depense = resource.Spec{
	Table:        "DEPENSE",
	IDColumn:     "id_depense",
	ParentColumn: "id_depense_group",
	ParentOwned:  "SELECT 1 FROM DEPENSE_GROUP WHERE id_depense_group = ? AND id_utilisateur = ?",
	OwnedIDs:     "SELECT id_depense_group FROM DEPENSE_GROUP WHERE id_utilisateur = ?",
	Ordered:      true,
	Columns: map[string]resource.Kind{
		"label":  resource.Text,
		"valeur": resource.NullReal,
	},
	Required: []string{"label", "id_depense_group"},
	Returned: "id_depense, label, valeur, ordre, id_depense_group",
}

var ProfilInvest = resource.Spec{
	Table:    "PROFIL_INVEST",
	IDColumn: "id_profil_inv",
	Rooted:   true,
	Archived: true,
	Columns: map[string]resource.Kind{
		"label":             resource.Text,
		"taux":              resource.NullReal,
		"style_acquisition": resource.Text,
		"couleur":           resource.NullText,
		"archive_le":        resource.NullText,
	},
	Required: []string{"label"},
	Returned: "id_profil_inv, label, taux, style_acquisition, couleur, archive_le",
}

// Une position = un titre du catalogue dans une enveloppe. Nom, prix, dividende et mois
// de versement viennent du titre. archive_le est modifiable : racheter un titre archivé
// remet la ligne en service (UNIQUE enveloppe + titre interdit le doublon).
var Action = resource.Spec{
	Table:        "ACTION",
	IDColumn:     "id_action",
	ParentColumn: "id_profil_inv",
	ParentOwned:  "SELECT 1 FROM PROFIL_INVEST WHERE id_profil_inv = ? AND id_utilisateur = ?",
	OwnedIDs:     "SELECT id_profil_inv FROM PROFIL_INVEST WHERE id_utilisateur = ?",
	Ordered:      true,
	Archived:     true,
	Columns: map[string]resource.Kind{
		"id_titre":       resource.Integer,
		"nb_part_acquis": resource.NullReal,
		"prix_inv":       resource.NullReal,
		"nb_inv":         resource.NullReal,
		"archive_le":     resource.NullText,
	},
	Required: []string{"id_titre", "id_profil_inv"},
	Returned: "id_action, id_profil_inv, id_titre, ordre, nb_part_acquis, prix_inv, nb_inv, archive_le",
}

var Banned = resource.Spec{
	Table:    "BANNED",
	IDColumn: "id_banned",
	Rooted:   true,
	Columns: map[string]resource.Kind{
		"label": resource.Text,
		"texte": resource.NullText,
	},
	Required: []string{"label"},
	Returned: "id_banned, label, texte",
}

// Tables communes (catalogue) : lues en entier pour l'instantané, écrites par titre.go.
var Marche = resource.Spec{
	Table:    "MARCHE",
	IDColumn: "id_marche",
	Returned: "id_marche, label",
}

var VersementDiv = resource.Spec{
	Table:    "VERSEMENT_DIV",
	Returned: "id_titre, mois",
}
