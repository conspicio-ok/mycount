import { Action, ProfilInvest, Bilan } from '../db/queries';
import { roundMoney } from './money';

export function computeRendNet(action: Action, moisCount: number, taux: number) {
	if (!action.prix || !action.div) return 0;
	const divAnnuel = action.div * moisCount;
	return roundMoney((divAnnuel / action.prix) * (1 - taux / 100) * 100);
}

export function computeRendAn(action: Action, moisCount: number, taux: number) {
	const valAcq = (action.prix ?? 0) * (action.nb_part_acquis ?? 0);
	return roundMoney((computeRendNet(action, moisCount, taux) / 100) * valAcq);
}

// Investissement mensuel d'une position, toujours converti en € : en style "parts",
// nb_inv (nombre de parts achetées/mois) × prix (prix unitaire de la part).
export function investMensuelEuros(action: Action, style: string | null) {
	return style === 'parts' ? (action.nb_inv ?? 0) * (action.prix ?? 0) : (action.prix_inv ?? 0);
}

// Taux de rendement global d'une enveloppe : moyenne des rendNet de ses positions,
// pondérée par le capital investi (prix × parts acquises) de chacune — c'est ce taux,
// déjà calculé à partir des chiffres réels d'Investir, qui sert de base à la Projection
// (pas de taux saisi à la main).
export function envelopeTauxGlobal(actions: Action[], profil: ProfilInvest, moisByAction: Record<number, number[]>): number {
	const positions = actions.filter((a) => a.id_profil_inv === profil.id_profil_inv);
	let totalValAcq = 0;
	let totalRendAn = 0;
	positions.forEach((a) => {
		const moisCount = (moisByAction[a.id_action] ?? []).length;
		totalValAcq += (a.prix ?? 0) * (a.nb_part_acquis ?? 0);
		totalRendAn += computeRendAn(a, moisCount, profil.taux ?? 0);
	});
	return totalValAcq > 0 ? roundMoney((totalRendAn / totalValAcq) * 100) : 0;
}

// Gain (dividendes nets) projeté d'une enveloppe pour une année à `yearsFromNow` : pour
// chaque position, projette le nombre de parts qu'elle aura acquises à cette échéance
// (parts déjà acquises + achats mensuels × 12 × nb d'années) et calcule le dividende
// annuel réel que ce nombre de parts rapporterait, net d'impôt.
export function envelopeProjectedGain(actions: Action[], profil: ProfilInvest, moisByAction: Record<number, number[]>, yearsFromNow: number): number {
	const positions = actions.filter((a) => a.id_profil_inv === profil.id_profil_inv);
	let total = 0;
	positions.forEach((a) => {
		const monthlyShares = profil.style_acquisition === 'parts'
			? (a.nb_inv ?? 0)
			: ((a.prix ?? 0) > 0 ? (a.prix_inv ?? 0) / (a.prix as number) : 0);
		const shares = (a.nb_part_acquis ?? 0) + monthlyShares * 12 * yearsFromNow;
		const moisCount = (moisByAction[a.id_action] ?? []).length;
		const dividendeAnnuel = shares * (a.div ?? 0) * moisCount;
		total += dividendeAnnuel * (1 - (profil.taux ?? 0) / 100);
	});
	return roundMoney(total);
}

export function envelopeInvestAnnuel(actions: Action[], profil: ProfilInvest): number {
	return roundMoney(
		actions
			.filter((a) => a.id_profil_inv === profil.id_profil_inv)
			.reduce((sum, a) => sum + investMensuelEuros(a, profil.style_acquisition), 0) * 12
	);
}

// Patrimoine cumulé réel (Suivi) par enveloppe : `valeur` sur un bilan est un montant investi
// CE mois-là (un ajout), pas un solde — le patrimoine est donc la somme de tous les mois
// (valeur + gain), pas la dernière ligne saisie.
export function latestValeurByProfil(profils: ProfilInvest[], bilans: Bilan[]): Record<number, number> {
	const result: Record<number, number> = {};
	profils.forEach((p) => {
		const history = bilans.filter((b) => b.id_profil_inv === p.id_profil_inv);
		result[p.id_profil_inv] = roundMoney(history.reduce((sum, b) => sum + (b.valeur ?? 0) + (b.gain ?? 0), 0));
	});
	return result;
}

// Investi/gain réel d'une année civile pour une enveloppe, à partir des bilans mensuels de
// Suivi : `valeur` est un montant investi ce mois-là (pas un solde), donc investi = somme des
// valeurs de l'année, gain = somme des gains de l'année, et le patrimoine cumulé en fin d'année
// = patrimoine cumulé avant l'année + investi + gain. Un mois sans bilan vaut 0 des deux côtés,
// donc un trou ne fausse jamais le calcul. Retourne null si aucun bilan n'existe pour cette
// année (le passé ne se prédit jamais : dans ce cas l'appelant traite l'année comme future).
export function realInvestGainAnnee(bilans: Bilan[], id_profil_inv: number, year: number): { investi: number; gain: number; valeurFin: number } | null {
	const rows = bilans.filter((b) => b.id_profil_inv === id_profil_inv && b.date.startsWith(`${year}-`));
	if (rows.length === 0) return null;
	const investi = roundMoney(rows.reduce((sum, b) => sum + (b.valeur ?? 0), 0));
	const gain = roundMoney(rows.reduce((sum, b) => sum + (b.gain ?? 0), 0));
	const valeurFin = roundMoney(valeurAvantAnnee(bilans, id_profil_inv, year) + investi + gain);
	return { investi, gain, valeurFin };
}

// Un point mensuel futur projeté : nombre de parts qui évolue mois après mois (parts déjà
// acquises + achats mensuels réels d'Investir), dividende versé les mois de VERSEMENT_DIV
// calculé sur le nombre de parts détenues juste avant l'achat du mois (n-1).
export type MonthlyPoint = { year: number; month: number; investi: number; gain: number };

function computeFutureMonthlyPoints(
	actions: Action[], profil: ProfilInvest, moisByAction: Record<number, number[]>,
	fromYear: number, fromMonth: number, monthsCount: number
): MonthlyPoint[] {
	const positions = actions.filter((a) => a.id_profil_inv === profil.id_profil_inv);
	const runningShares: Record<number, number> = {};
	positions.forEach((a) => { runningShares[a.id_action] = a.nb_part_acquis ?? 0; });

	const points: MonthlyPoint[] = [];
	let year = fromYear;
	let month = fromMonth;
	for (let i = 0; i < monthsCount; i++) {
		let investi = 0;
		let gain = 0;
		positions.forEach((a) => {
			const monthlyShares = profil.style_acquisition === 'parts'
				? (a.nb_inv ?? 0)
				: ((a.prix ?? 0) > 0 ? (a.prix_inv ?? 0) / (a.prix as number) : 0);
			if ((moisByAction[a.id_action] ?? []).includes(month)) {
				gain += runningShares[a.id_action] * (a.div ?? 0) * (1 - (profil.taux ?? 0) / 100);
			}
			investi += investMensuelEuros(a, profil.style_acquisition);
			runningShares[a.id_action] += monthlyShares;
		});
		points.push({ year, month, investi: roundMoney(investi), gain: roundMoney(gain) });
		month++;
		if (month > 12) { month = 1; year++; }
	}
	return points;
}

export type YearAggregate = { year: number; investi: number; gain: number; valeurFin: number };

// Patrimoine cumulé avant une année donnée : somme de tous les montants investis + gains
// enregistrés avant cette année (`valeur` est un ajout mensuel, pas un solde, donc le total
// se construit par somme, jamais en prenant la dernière ligne).
function valeurAvantAnnee(bilans: Bilan[], id_profil_inv: number, year: number): number {
	return roundMoney(
		bilans
			.filter((b) => b.id_profil_inv === id_profil_inv && b.date < `${year}-01`)
			.reduce((sum, b) => sum + (b.valeur ?? 0) + (b.gain ?? 0), 0)
	);
}

// Série annuelle "vive" d'une enveloppe : année en cours + années futures (horizonYears au
// total). Le passé (mois déjà écoulés de l'année en cours) vient des bilans réels de Suivi
// (jamais prédit) ; le reste est calculé mois par mois à partir des chiffres réels d'Investir
// (parts détenues, calendrier de versement des dividendes). Coût borné à `horizonYears` années
// — ne reparcourt jamais tout l'historique passé (voir computeEnvelopePastYears pour ça).
export function computeEnvelopeYearlySeries(
	actions: Action[], profil: ProfilInvest, moisByAction: Record<number, number[]>,
	bilans: Bilan[], currentYear: number, horizonYears: number
): YearAggregate[] {
	const id = profil.id_profil_inv;
	const thisYearBilans = bilans.filter((b) => b.id_profil_inv === id && b.date.startsWith(`${currentYear}-`));
	const lastRealMonth = thisYearBilans.length > 0
		? Math.max(...thisYearBilans.map((b) => parseInt(b.date.split('-')[1], 10)))
		: 0;

	const realPartCurrentYear = realInvestGainAnnee(bilans, id, currentYear);
	const remainingMonthsThisYear = 12 - lastRealMonth;
	const totalFutureMonths = remainingMonthsThisYear + (horizonYears - 1) * 12;
	const futurePoints = computeFutureMonthlyPoints(actions, profil, moisByAction, currentYear, lastRealMonth + 1, totalFutureMonths);

	const result: YearAggregate[] = [];
	let valeur = realPartCurrentYear?.valeurFin ?? valeurAvantAnnee(bilans, id, currentYear);
	for (let offset = 0; offset < horizonYears; offset++) {
		const year = currentYear + offset;
		let investi = 0;
		let gain = 0;
		if (offset === 0) {
			investi += realPartCurrentYear?.investi ?? 0;
			gain += realPartCurrentYear?.gain ?? 0;
		}
		futurePoints
			.filter((p) => p.year === year)
			.forEach((p) => {
				investi += p.investi;
				gain += p.gain;
				valeur += p.gain + p.investi;
			});
		result.push({ year, investi: roundMoney(investi), gain: roundMoney(gain), valeurFin: roundMoney(valeur) });
	}
	return result;
}

// Nombre d'années passées (< currentYear) distinctes, toutes enveloppes confondues — lookup
// bon marché (pas de calcul mois par mois) pour afficher un compteur sans ouvrir l'historique.
// Union, pas max : deux enveloppes avec des années passées différentes doivent bien s'additionner.
export function pastYearsCount(bilans: Bilan[], currentYear: number): number {
	const years = new Set<number>();
	bilans.forEach((b) => {
		const y = parseInt(b.date.slice(0, 4), 10);
		if (y < currentYear) years.add(y);
	});
	return years.size;
}

// Série des années passées (réel uniquement, jamais prédit) — coûteux sur un long historique
// (reparcourt chaque année), à n'appeler qu'à l'ouverture explicite du module "Historique".
export function computeEnvelopePastYears(bilans: Bilan[], profil: ProfilInvest, currentYear: number): YearAggregate[] {
	const id = profil.id_profil_inv;
	const profilBilans = bilans.filter((b) => b.id_profil_inv === id);
	if (profilBilans.length === 0) return [];
	const firstYear = Math.min(...profilBilans.map((b) => parseInt(b.date.slice(0, 4), 10)));

	const result: YearAggregate[] = [];
	let valeur = 0;
	for (let year = firstYear; year < currentYear; year++) {
		const real = realInvestGainAnnee(bilans, id, year);
		if (real) valeur = real.valeurFin;
		result.push({
			year,
			investi: roundMoney(real?.investi ?? 0),
			gain: roundMoney(real?.gain ?? 0),
			valeurFin: roundMoney(valeur),
		});
	}
	return result;
}
