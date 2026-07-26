const MONTHS = [
	'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
	'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function getMonthLabel(date: Date = new Date()): string {
	return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
