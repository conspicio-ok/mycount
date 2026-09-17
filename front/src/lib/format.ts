const amountFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/* Montant lisible à la française : espace des milliers, virgule décimale, unité en suffixe. */
export function formatAmount(value: number, unit: string = '€'): string
{
	return `${amountFormat.format(value)} ${unit}`
}

/* Part de la couleur d'origine dans le mélange avec du blanc : plus bas = plus pastel. */
const PASTEL_STRENGTH = 55

/* Couleur stockée en hex sans # (format de la base) vers sa version pastel affichée.
   Le mélange se fait à l'affichage, en OKLab pour garder la teinte perçue : la base
   conserve la couleur d'origine, et changer PASTEL_STRENGTH s'applique à tout, données
   existantes comprises. Gris par défaut. */
export function displayColor(couleur: string | null | undefined): string
{
	return `color-mix(in oklab, #${couleur ?? '808080'} ${PASTEL_STRENGTH}%, white)`
}
