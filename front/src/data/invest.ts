import type { action, mouvement, profilInvest, titre, versementDiv } from './types'
import { roundMoney }										from './money'

/* Calculs d'investissement, portés de l'app React Native à l'identique.
   Rien n'est stocké : tout se recalcule à partir des tables à chaque saisie. */

/* Mois de versement par titre (commun). */
export type MonthsByTitre = Record<number, number[]>
export type MonthsByAction = MonthsByTitre

/* Titres indexés par id : renseigné par les pages depuis db.TITRE avant tout calcul. */
export type TitreIndex = Record<number, titre>

export function indexTitres(titres: titre[]): TitreIndex
{
	const index: TitreIndex = {}
	for (const row of titres) index[row.id_titre] = row
	return index
}

export interface yearAggregate
{
	year:		number;
	investi:	number;
	gain:		number;
	valeurFin:	number;
}

interface monthlyPoint
{
	year:		number;
	month:		number;
	investi:	number;
	gain:		number;
}

export function indexMonths(versements: versementDiv[]): MonthsByAction
{
	const index: MonthsByAction = {}
	for (const versement of versements)
	{
		index[versement.id_titre] ??= []
		index[versement.id_titre].push(versement.mois)
	}
	return index
}

/* Positions visibles d'une enveloppe : non archivées (une position vendue à 0 part est
   archivée par le serveur ; elle existe encore, avec son journal). */
export function positionsOf(actions: action[], idProfil: number): action[]
{
	const positions: action[] = []
	for (const position of actions)
		if (position.id_profil_inv === idProfil && position.archive_le === null) positions.push(position)
	return positions
}

export function isActive(profil: profilInvest): boolean
{
	return profil.archive_le === null
}

/* Rendement net d'impôt, en % du prix : dividende annuel (versement × fréquence) / prix. */
export function computeRendNet(position: action, moisCount: number, taux: number): number
{
	if (!prixOf(position) || !divOf(position)) return 0

	const divAnnuel = divOf(position) * moisCount
	return roundMoney((divAnnuel / prixOf(position)) * (1 - taux / 100) * 100)
}

/* Rendement annuel net en €, sur la valeur acquise (prix × parts détenues). */
export function computeRendAn(position: action, moisCount: number, taux: number): number
{
	const valAcq = prixOf(position) * (position.nb_part_acquis ?? 0)
	return roundMoney((computeRendNet(position, moisCount, taux) / 100) * valAcq)
}

/* Investissement mensuel toujours converti en € : en style "parts",
   nb_inv (parts achetées par mois) × prix unitaire. */
export function investMensuelEuros(position: action, style: string | null): number
{
	if (style === 'parts') return (position.nb_inv ?? 0) * prixOf(position)
	return position.prix_inv ?? 0
}

export function envelopeInvestMensuel(actions: action[], profil: profilInvest): number
{
	let total = 0
	for (const position of positionsOf(actions, profil.id_profil_inv))
		total += investMensuelEuros(position, profil.style_acquisition)
	return roundMoney(total)
}

export function investMensuelTotal(profils: profilInvest[], actions: action[]): number
{
	let total = 0
	for (const profil of profils)
		total += envelopeInvestMensuel(actions, profil)
	return roundMoney(total)
}

/* Taux global d'une enveloppe : moyenne des rendements nets de ses positions,
   pondérée par le capital investi de chacune. Sert de base à la Projection. */
export function envelopeTauxGlobal(actions: action[], profil: profilInvest, months: MonthsByAction): number
{
	let totalValAcq = 0
	let totalRendAn = 0
	for (const position of positionsOf(actions, profil.id_profil_inv))
	{
		const moisCount = monthsOf(position, months).length
		totalValAcq += prixOf(position) * (position.nb_part_acquis ?? 0)
		totalRendAn += computeRendAn(position, moisCount, profil.taux ?? 0)
	}

	if (totalValAcq <= 0) return 0
	return roundMoney((totalRendAn / totalValAcq) * 100)
}

/* Parts achetées par mois : directement nb_inv en style "parts", sinon le montant
   mensuel converti au prix unitaire actuel. */
function monthlySharesFor(position: action, profil: profilInvest): number
{
	if (profil.style_acquisition === 'parts') return position.nb_inv ?? 0
	if (!prixOf(position)) return 0
	return (position.prix_inv ?? 0) / prixOf(position)
}

/* ── Métriques réelles, depuis le journal des mouvements ────────────────────
   investi = Σ achats (parts × prix du mouvement) − Σ ventes ; un mouvement sans prix compte 0.
   valeur  = Σ parts détenues × prixOf(position) — prix courant, jamais l'historique.
   gain    = valeur − investi.
   Un changement de prix courant ne touche jamais MOUVEMENT.prix : l'achat reste ce qu'il a été. */

/* Catalogue courant, fourni par le store (db.TITRE) via setTitres avant tout calcul.
   Seul point de lecture du prix, du dividende et du nom d'une position. */
let titres: TitreIndex = {}

export function setTitres(index: TitreIndex): void
{
	titres = index
}

export function titreOf(position: action): titre | null
{
	return titres[position.id_titre] ?? null
}

export function prixOf(position: action): number
{
	return titreOf(position)?.prix ?? 0
}

export function divOf(position: action): number
{
	return titreOf(position)?.div ?? 0
}

export function labelOf(position: action): string
{
	return titreOf(position)?.nom ?? ''
}

export function monthsOf(position: action, months: MonthsByTitre): number[]
{
	return months[position.id_titre] ?? []
}

export function montantOf(row: mouvement): number
{
	return row.nb_part * (row.prix ?? 0)
}

/* Investi net sur les mouvements dont la date commence par `prefix` ('' = tout, '2026', '2026-09'). */
export function investiOf(mouvements: mouvement[], idActions: Set<number> | null, prefix: string = ''): number
{
	let total = 0
	for (const row of mouvements)
	{
		if (idActions && !idActions.has(row.id_action)) continue
		if (!row.date.startsWith(prefix)) continue
		total += row.sens === 'vente' ? -montantOf(row) : montantOf(row)
	}
	return roundMoney(total)
}

/* Gain latent : uniquement sur les parts qui ont un coût connu, c'est-à-dire celles du
   journal (achats − ventes). Les parts saisies sans mouvement n'ont pas de prix de revient :
   elles comptent dans la valeur, pas dans le gain. gain = parts_journal × prix − investi. */
export function gainOf(positions: action[], mouvements: mouvement[]): number
{
	const tracked: Record<number, number> = {}
	for (const row of mouvements)
		tracked[row.id_action] = (tracked[row.id_action] ?? 0) + (row.sens === 'vente' ? -row.nb_part : row.nb_part)

	let valeur = 0
	for (const position of positions)
		valeur += (tracked[position.id_action] ?? 0) * prixOf(position)
	return roundMoney(valeur - investiOf(mouvements, idSet(positions)))
}

export function valeurOf(positions: action[]): number
{
	let total = 0
	for (const position of positions)
		total += (position.nb_part_acquis ?? 0) * prixOf(position)
	return roundMoney(total)
}

export function idSet(positions: action[]): Set<number>
{
	const ids = new Set<number>()
	for (const position of positions) ids.add(position.id_action)
	return ids
}

/* Points mensuels futurs : les parts évoluent mois après mois, le dividende d'un mois
   de versement est calculé sur les parts détenues avant l'achat du mois. */
function computeFutureMonthlyPoints(
	actions: action[], profil: profilInvest, months: MonthsByAction,
	fromYear: number, fromMonth: number, monthsCount: number
): monthlyPoint[]
{
	const positions = positionsOf(actions, profil.id_profil_inv)
	const shares: Record<number, number> = {}
	for (const position of positions)
		shares[position.id_action] = position.nb_part_acquis ?? 0

	const points: monthlyPoint[] = []
	let year  = fromYear
	let month = fromMonth
	if (month > 12)
	{
		month = 1
		year++
	}

	for (let i = 0; i < monthsCount; i++)
	{
		let investi = 0
		let gain    = 0
		for (const position of positions)
		{
			if (monthsOf(position, months).includes(month))
				gain += shares[position.id_action] * divOf(position) * (1 - (profil.taux ?? 0) / 100)

			investi += investMensuelEuros(position, profil.style_acquisition)
			shares[position.id_action] += monthlySharesFor(position, profil)
		}
		points.push({ year, month, investi: roundMoney(investi), gain: roundMoney(gain) })

		month++
		if (month > 12)
		{
			month = 1
			year++
		}
	}
	return points
}

/* Série annuelle d'une enveloppe sur `horizonYears` années à partir de l'année en cours.
   Année en cours : investi réel (journal) + mois restants projetés depuis Investir, en partant
   de la valeur actuelle (parts × prix). Le gain des mois écoulés n'est pas connu sans
   historique de prix : seul le gain futur (dividendes) est compté. */
export function computeEnvelopeYearlySeries(
	actions: action[], profil: profilInvest, months: MonthsByAction,
	mouvements: mouvement[], today: Date, horizonYears: number
): yearAggregate[]
{
	const currentYear	= today.getFullYear()
	const currentMonth	= today.getMonth() + 1
	const positions		= positionsOf(actions, profil.id_profil_inv)

	const futureMonths	= (12 - currentMonth) + (horizonYears - 1) * 12
	const futurePoints	= computeFutureMonthlyPoints(actions, profil, months, currentYear, currentMonth + 1, futureMonths)

	const result: yearAggregate[] = []
	let valeur = valeurOf(positions)
	for (let offset = 0; offset < horizonYears; offset++)
	{
		const year  = currentYear + offset
		let investi = offset === 0 ? investiOf(mouvements, idSet(positions), String(year)) : 0
		let gain    = 0
		for (const point of futurePoints)
		{
			if (point.year !== year) continue

			investi += point.investi
			gain    += point.gain
			valeur  += point.investi + point.gain
		}
		result.push({ year, investi: roundMoney(investi), gain: roundMoney(gain), valeurFin: roundMoney(valeur) })
	}
	return result
}
