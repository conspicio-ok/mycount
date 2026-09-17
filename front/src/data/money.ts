/* Arrondi au centime : évite les artefacts de virgule flottante
   (0.1 + 0.2 = 0.30000000000000004) sur les totaux calculés par somme,
   jamais sur une valeur saisie brute. */
export function roundMoney(value: number): number
{
	return Math.round(value * 100) / 100
}
