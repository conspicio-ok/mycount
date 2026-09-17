export const MONTH_LABELS = [
	'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
	'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

export const MONTH_LABELS_SHORT = [
	'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui',
	'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'
]

export function monthLabel(date: Date): string
{
	return `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`
}

/* Premier jour d'un mois, mois de 1 à 12. */
export function monthDate(year: number, month: number): string
{
	return `${year}-${String(month).padStart(2, '0')}-01`
}
