import { useState, useMemo, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import BottomSheet from '../components/BottomSheet';
import { useDb } from '../db/DbContext';
import {
	getProfilsInvest, ProfilInvest,
	getActions, Action,
	getVersementsDiv, VersementDiv,
	getBilans, Bilan,
} from '../db/queries';
import { colors } from '../theme';
import { roundMoney } from '../utils/money';
import { computeEnvelopeYearlySeries, computeEnvelopePastYears, pastYearsCount } from '../utils/invest';

const HORIZONS = [5, 10, 20, 30];
const PEA_PLAFOND = 150000;

type YearRow = {
	year:			number; // année calendaire réelle
	patrimoine:		number;
	investAn:		number;
	gainAn:			number;
	isPast:			boolean;
	capPea:			boolean;
	perProfil:		Record<number, { valeur: number; investi: number; gain: number }>;
};

export default function ProjectionScreen() {
	const db = useDb();
	const currentYear = new Date().getFullYear();

	const [profils, setProfils]   = useState<ProfilInvest[]>([]);
	const [actions, setActions]   = useState<Action[]>([]);
	const [versements, setVersements] = useState<VersementDiv[]>([]);
	const [bilans, setBilans]     = useState<Bilan[]>([]);
	const [horizon, setHorizon]   = useState(5);
	const [selectedYear, setSelectedYear] = useState<number | null>(null);
	const [historiqueOpen, setHistoriqueOpen] = useState(false);

	useFocusEffect(
		useCallback(() => {
			(async () => {
				setProfils(await getProfilsInvest(db));
				setActions(await getActions(db));
				setVersements(await getVersementsDiv(db));
				setBilans(await getBilans(db));
			})();
		}, [])
	);

	const moisByAction = useMemo(() => {
		const map: Record<number, number[]> = {};
		for (const v of versements) {
			(map[v.id_action] ??= []).push(v.mois);
		}
		return map;
	}, [versements]);

	// Le passé (mois déjà écoulés, y compris dans l'année en cours) vient exclusivement des
	// bilans réels de Suivi — jamais prédit. Le futur (mois restants de l'année en cours +
	// années suivantes) est calculé mois par mois à partir des chiffres réels d'Investir
	// (parts détenues, calendrier de versement des dividendes).
	const seriesByProfil = useMemo(
		() => profils.map((p) => ({
			profil: p,
			series: computeEnvelopeYearlySeries(actions, p, moisByAction, bilans, currentYear, horizon),
		})),
		[profils, actions, moisByAction, bilans, currentYear, horizon]
	);

	const rows: YearRow[] = useMemo(() => {
		const years = new Set<number>();
		seriesByProfil.forEach(({ series }) => series.forEach((s) => years.add(s.year)));

		return [...years].sort((a, b) => a - b).map((year) => {
			const perProfil: Record<number, { valeur: number; investi: number; gain: number }> = {};
			let patrimoine = 0;
			let investAn = 0;
			let gainAn = 0;
			seriesByProfil.forEach(({ profil, series }) => {
				const s = series.find((row) => row.year === year);
				if (!s) return;
				perProfil[profil.id_profil_inv] = { valeur: s.valeurFin, investi: s.investi, gain: s.gain };
				patrimoine += s.valeurFin;
				investAn += s.investi;
				gainAn += s.gain;
			});
			const peaProfil = profils.find((p) => /pea/i.test(p.label));
			const capPea = !!peaProfil && (perProfil[peaProfil.id_profil_inv]?.valeur ?? 0) >= PEA_PLAFOND;
			return {
				year,
				patrimoine: roundMoney(patrimoine),
				investAn: roundMoney(investAn),
				gainAn: roundMoney(gainAn),
				isPast: year < currentYear,
				capPea,
				perProfil,
			};
		});
	}, [seriesByProfil, profils, currentYear]);

	// Compteur bon marché (pas de calcul mois par mois) affiché sur le bouton fermé.
	const pastYearsTotal = useMemo(
		() => pastYearsCount(bilans, currentYear),
		[bilans, currentYear]
	);

	// Le détail des années passées est coûteux (reparcourt chaque année de l'historique) —
	// on ne le calcule qu'à l'ouverture explicite du module, jamais en continu.
	const pastRows: YearRow[] = useMemo(() => {
		if (!historiqueOpen) return [];
		const seriesByProfilPast = profils.map((p) => ({ profil: p, series: computeEnvelopePastYears(bilans, p, currentYear) }));
		const years = new Set<number>();
		seriesByProfilPast.forEach(({ series }) => series.forEach((s) => years.add(s.year)));

		return [...years].sort((a, b) => a - b).map((year) => {
			const perProfil: Record<number, { valeur: number; investi: number; gain: number }> = {};
			let patrimoine = 0;
			let investAn = 0;
			let gainAn = 0;
			seriesByProfilPast.forEach(({ profil, series }) => {
				const s = series.find((row) => row.year === year);
				if (!s) return;
				perProfil[profil.id_profil_inv] = { valeur: s.valeurFin, investi: s.investi, gain: s.gain };
				patrimoine += s.valeurFin;
				investAn += s.investi;
				gainAn += s.gain;
			});
			return {
				year,
				patrimoine: roundMoney(patrimoine),
				investAn: roundMoney(investAn),
				gainAn: roundMoney(gainAn),
				isPast: true,
				capPea: false,
				perProfil,
			};
		});
	}, [historiqueOpen, profils, bilans, currentYear]);

	const selectedRow = selectedYear != null
		? rows.find((r) => r.year === selectedYear) ?? pastRows.find((r) => r.year === selectedYear) ?? null
		: null;

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<ScreenHeader title="Projection" />
			<Text style={styles.subtitle}>Croissance automatique de ton patrimoine, à partir des taux déjà calculés dans Investir</Text>

			{pastYearsTotal > 0 && (
				<>
					<TouchableOpacity style={styles.historiqueButton} onPress={() => setHistoriqueOpen((v) => !v)}>
						<Text style={styles.historiqueButtonText}>
							{historiqueOpen ? 'Masquer' : 'Afficher'} l'historique — {pastYearsTotal} année{pastYearsTotal > 1 ? 's' : ''} passée{pastYearsTotal > 1 ? 's' : ''}
						</Text>
					</TouchableOpacity>
					{historiqueOpen && (
						<View style={styles.table}>
							{pastRows.map((row) => (
								<TouchableOpacity key={row.year} style={styles.tableRow} onPress={() => setSelectedYear(row.year)}>
									<View style={styles.yearCell}>
										<Text style={[styles.cell, styles.yearText]}>{row.year}</Text>
										<Text style={styles.pastText}>réel</Text>
									</View>
									<Text style={[styles.cell, styles.investCell]}>{row.investAn} €</Text>
									<Text style={[styles.cell, styles.gainCell, styles.gainText]}>+{row.gainAn} €</Text>
								</TouchableOpacity>
							))}
						</View>
					)}
				</>
			)}

			<Text style={styles.sectionLabel}>Horizon</Text>
			<View style={styles.horizonRow}>
				{HORIZONS.map((h) => (
					<TouchableOpacity
						key={h}
						style={[styles.horizonButton, horizon === h && styles.horizonButtonActive]}
						onPress={() => setHorizon(h)}
					>
						<Text style={[styles.horizonButtonText, horizon === h && styles.horizonButtonTextActive]}>{h} ans</Text>
					</TouchableOpacity>
				))}
			</View>

			<View style={styles.table}>
				<View style={styles.tableHeader}>
					<Text style={[styles.headerCell, styles.yearCell]}>Année</Text>
					<Text style={[styles.headerCell, styles.investCell]}>Investi / an</Text>
					<Text style={[styles.headerCell, styles.gainCell]}>Gain / an</Text>
				</View>
				{rows.length === 0 ? (
					<Text style={styles.emptyText}>Aucune enveloppe — ajoutez-en une dans Investir</Text>
				) : (
					rows.map((row) => (
						<TouchableOpacity
							key={row.year}
							style={[
								styles.tableRow,
								row.year === currentYear && styles.tableRowCurrent,
								row.capPea && styles.tableRowCapped,
							]}
							onPress={() => setSelectedYear(row.year)}
						>
							<View style={styles.yearCell}>
								<Text style={[styles.cell, styles.yearText, row.year === currentYear && styles.yearTextCurrent]}>{row.year}</Text>
								{row.capPea && <Text style={styles.capText}>Plafond PEA</Text>}
								{row.year === currentYear && <Text style={styles.pastText}>en cours</Text>}
							</View>
							<Text style={[styles.cell, styles.investCell]}>{row.investAn} €</Text>
							<Text style={[styles.cell, styles.gainCell, styles.gainText]}>+{row.gainAn} €</Text>
						</TouchableOpacity>
					))
				)}
			</View>
			<Text style={styles.hint}>Touchez une année pour le détail par enveloppe</Text>
			<Text style={styles.hint}>Passé : chiffres réels de Suivi · futur : calculé à partir d'Investir</Text>
			<Text style={styles.capLegend}>◼ Plafond PEA atteint · taux et versements repris d'Investir</Text>

			<BottomSheet visible={selectedYear != null} onClose={() => setSelectedYear(null)}>
				{selectedRow && (
					<>
						<Text style={styles.sheetTitle}>Année {selectedRow.year}</Text>
						<View style={styles.sheetSummaryCard}>
							<View style={styles.sheetFieldRow}>
								<Text style={styles.sheetFieldLabel}>Patrimoine total</Text>
								<Text style={styles.sheetFieldValue}>{selectedRow.patrimoine} €</Text>
							</View>
							<View style={[styles.sheetFieldRow, styles.sheetFieldRowLast]}>
								<Text style={styles.sheetFieldLabel}>Investi / an</Text>
								<Text style={styles.sheetFieldValue}>{selectedRow.investAn} €</Text>
							</View>
						</View>

						{profils.map((p) => (
							<View key={p.id_profil_inv} style={[styles.sheetEnvCard, { borderLeftColor: `#${p.couleur ?? '808080'}` }]}>
								<View style={styles.sheetEnvHeader}>
									<View style={[styles.dot, { backgroundColor: `#${p.couleur ?? '808080'}` }]} />
									<Text style={styles.sheetEnvLabel}>{p.label}</Text>
								</View>
								<View style={styles.sheetFieldRow}>
									<Text style={styles.sheetFieldLabel}>Valeur</Text>
									<Text style={styles.sheetFieldValue}>{selectedRow.perProfil[p.id_profil_inv]?.valeur ?? 0} €</Text>
								</View>
								<View style={styles.sheetFieldRow}>
									<Text style={styles.sheetFieldLabel}>Investi / an</Text>
									<Text style={styles.sheetFieldValue}>{selectedRow.perProfil[p.id_profil_inv]?.investi ?? 0} €</Text>
								</View>
								<View style={[styles.sheetFieldRow, styles.sheetFieldRowLast]}>
									<Text style={styles.sheetFieldLabel}>Gain / an</Text>
									<Text style={[styles.sheetFieldValue, { color: `#${p.couleur ?? '808080'}` }]}>
										+{selectedRow.perProfil[p.id_profil_inv]?.gain ?? 0} €
									</Text>
								</View>
							</View>
						))}

						<View style={styles.sheetSummaryCard}>
							<View style={[styles.sheetFieldRow, styles.sheetFieldRowLast]}>
								<Text style={styles.sheetFieldLabel}>Revenu passif / mois</Text>
								<Text style={[styles.sheetFieldValue, { color: colors.accent }]}>{roundMoney(selectedRow.gainAn / 12)} €</Text>
							</View>
						</View>
					</>
				)}
			</BottomSheet>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		padding: 20,
	},
	subtitle: {
		fontSize: 14,
		color: colors.textSecondary,
		marginTop: 4,
	},
	sectionLabel: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textSecondary,
		textTransform: 'uppercase',
		letterSpacing: 0.4,
		marginTop: 22,
	},
	horizonRow: {
		flexDirection: 'row',
		gap: 8,
		marginTop: 10,
	},
	horizonButton: {
		flex: 1,
		alignItems: 'center',
		paddingVertical: 10,
		borderRadius: 12,
		backgroundColor: colors.accentBg,
	},
	horizonButtonActive: {
		backgroundColor: colors.highlight,
	},
	horizonButtonText: {
		fontSize: 14,
		fontWeight: '700',
		color: colors.textSecondary,
	},
	horizonButtonTextActive: {
		color: colors.white,
	},
	table: {
		marginTop: 16,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 18,
		overflow: 'hidden',
	},
	tableHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 10,
		paddingHorizontal: 14,
		backgroundColor: colors.accentBg,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	headerCell: {
		fontSize: 11,
		fontWeight: '700',
		color: colors.textSecondary,
		textTransform: 'uppercase',
	},
	tableRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		paddingHorizontal: 14,
		borderBottomWidth: 1,
		borderBottomColor: colors.divider,
	},
	tableRowCapped: {
		backgroundColor: '#fbe4e0',
	},
	tableRowCurrent: {
		backgroundColor: colors.accentBg,
	},
	yearTextCurrent: {
		color: colors.accent,
	},
	historiqueButton: {
		marginTop: 18,
		paddingVertical: 10,
		borderRadius: 12,
		alignItems: 'center',
		backgroundColor: colors.accentBg,
	},
	historiqueButtonText: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textSecondary,
	},
	cell: {
		fontSize: 14,
		color: colors.textPrimary,
	},
	yearCell: {
		width: 48,
	},
	yearText: {
		fontWeight: '700',
	},
	investCell: {
		flex: 1,
		textAlign: 'right',
		fontWeight: '700',
	},
	capText: {
		fontSize: 10,
		fontWeight: '700',
		color: '#c2482d',
		marginTop: 2,
	},
	pastText: {
		fontSize: 10,
		fontWeight: '600',
		color: colors.textSecondary,
		marginTop: 2,
	},
	gainCell: {
		width: 100,
		textAlign: 'right',
	},
	gainText: {
		fontWeight: '700',
		color: colors.accent,
	},
	emptyText: {
		fontSize: 14,
		color: colors.textSecondary,
		paddingVertical: 20,
		textAlign: 'center',
	},
	hint: {
		fontSize: 12,
		color: colors.textSecondary,
		textAlign: 'center',
		marginTop: 10,
	},
	capLegend: {
		fontSize: 12,
		color: colors.textSecondary,
		textAlign: 'center',
		marginTop: 14,
	},
	sheetTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: colors.textPrimary,
		marginBottom: 12,
	},
	sheetSummaryCard: {
		backgroundColor: colors.accentBg,
		borderRadius: 16,
		paddingHorizontal: 14,
		marginBottom: 14,
	},
	sheetEnvCard: {
		backgroundColor: colors.accentBg,
		borderRadius: 16,
		borderLeftWidth: 4,
		paddingHorizontal: 14,
		marginBottom: 12,
	},
	sheetEnvHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingTop: 12,
		paddingBottom: 2,
	},
	dot: {
		width: 10,
		height: 10,
		borderRadius: 3,
	},
	sheetEnvLabel: {
		fontSize: 15,
		fontWeight: '700',
		color: colors.textPrimary,
	},
	sheetFieldRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.divider,
	},
	sheetFieldRowLast: {
		borderBottomWidth: 0,
	},
	sheetFieldLabel: {
		fontSize: 14,
		color: colors.textSecondary,
		fontWeight: '500',
	},
	sheetFieldValue: {
		fontSize: 15,
		fontWeight: '700',
		color: colors.textPrimary,
	},
});
