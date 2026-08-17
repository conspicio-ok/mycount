import { useState, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import Bubble from '../components/Bubble';
import { useDb } from '../db/DbContext';
import {
	getProfilsInvest, addProfilInvest, ProfilInvest,
	getBilans, addBilan, updateBilanValeur, updateBilanGain, deleteBilan, deleteEmptyGhostBilans, Bilan,
} from '../db/queries';
import { colors, radius } from '../theme';
import { roundMoney } from '../utils/money';
import { MONTH_LABELS_SHORT as MONTH_LABELS } from '../utils/date';

const ENV_COLORS = ['3c8ae0', 'e0b23c', '9c5cd6', '3ab08a', 'd6485c'];

function monthDate(year: number, monthIndex: number): string {
	return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
}

function num(text: string): number {
	const n = Number(text.replace(',', '.'));
	return isNaN(n) ? 0 : n;
}

export default function SuiviScreen() {
	const db = useDb();
	const currentYear = new Date().getFullYear();

	const [year, setYear] = useState(currentYear);
	const [yearPickerOpen, setYearPickerOpen] = useState(false);
	const [profils, setProfils] = useState<ProfilInvest[]>([]);
	const [bilans, setBilans]   = useState<Bilan[]>([]);
	const [selMonth, setSelMonth] = useState(new Date().getMonth());
	const [valeurDrafts, setValeurDrafts] = useState<Record<string, string>>({});
	const [gainDrafts, setGainDrafts]     = useState<Record<string, string>>({});

	async function loadProfils() {
		setProfils(await getProfilsInvest(db));
	}

	async function loadBilans() {
		await deleteEmptyGhostBilans(db);
		setBilans(await getBilans(db));
	}

	useFocusEffect(
		useCallback(() => {
			loadProfils();
			loadBilans();
		}, [])
	);

	async function handleAddEnvelope() {
		const couleur = ENV_COLORS[profils.length % ENV_COLORS.length];
		await addProfilInvest(db, 'Nouvelle enveloppe', 0, 'montant', couleur);
		await loadProfils();
	}

	const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

	function handleDeleteBilan(id_profil_inv: number | null, id_bilan: number, label: string) {
		Alert.alert(
			'Supprimer cet enregistrement ?',
			`${label} — ${MONTH_LABELS[selMonth]} ${year} : la valeur et le gain saisis seront effacés.`,
			[
				{ text: 'Annuler', style: 'cancel' },
				{
					text: 'Supprimer',
					style: 'destructive',
					onPress: async () => {
						try {
							await deleteBilan(db, id_bilan);
							const key = draftKey(id_profil_inv, date, id_bilan);
							setValeurDrafts((prev) => ({ ...prev, [key]: '' }));
							setGainDrafts((prev) => ({ ...prev, [key]: '' }));
							await loadBilans();
						} catch {
							Alert.alert('Erreur', 'La suppression a échoué.');
						}
					},
				},
			]
		);
	}

	const date = monthDate(year, selMonth);

	// Enveloppes actives (celles d'Investir) + lignes "fantômes" : bilans du mois dont
	// l'enveloppe d'origine a été supprimée depuis — conservées telles quelles (label/couleur figés)
	const rows = [
		...profils.map((p) => ({
			key: 'p' + p.id_profil_inv,
			id_profil_inv: p.id_profil_inv as number | null,
			label: p.label,
			couleur: p.couleur ?? '808080',
			bilan: bilans.find((b) => b.id_profil_inv === p.id_profil_inv && b.date === date) ?? null,
			ghost: false,
		})),
		...bilans
			.filter((b) => b.date === date && b.id_profil_inv === null)
			.map((b) => ({
				key: 'g' + b.id_bilan,
				id_profil_inv: null as number | null,
				label: b.label ?? '—',
				couleur: b.couleur ?? '808080',
				bilan: b,
				ghost: true,
			})),
	];

	// Clé par enveloppe + mois (pas par bilan) : tant qu'aucun bilan n'existe encore pour un
	// mois donné, il n'y a pas d'id_bilan pour distinguer les mois entre eux — sans le mois
	// dans la clé, le brouillon d'un mois vide restait affiché en changeant de mois.
	function draftKey(id_profil_inv: number | null, rowDate: string, id_bilan: number | null) {
		return id_profil_inv !== null ? 'p' + id_profil_inv + '-' + rowDate : 'g' + id_bilan;
	}

	async function handleValeurChange(id_profil_inv: number | null, label: string, couleur: string, bilan: Bilan | null, text: string) {
		const key = draftKey(id_profil_inv, date, bilan?.id_bilan ?? null);
		setValeurDrafts((prev) => ({ ...prev, [key]: text }));
		const parsed = text === '' ? null : num(text);

		if (bilan) {
			await updateBilanValeur(db, bilan.id_bilan, parsed);
		} else if (id_profil_inv !== null) {
			await addBilan(db, id_profil_inv, date, parsed, null, label, couleur);
		}
		await loadBilans();
	}

	async function handleGainChange(id_profil_inv: number | null, label: string, couleur: string, bilan: Bilan | null, text: string) {
		const key = draftKey(id_profil_inv, date, bilan?.id_bilan ?? null);
		setGainDrafts((prev) => ({ ...prev, [key]: text }));
		const parsed = text === '' ? null : num(text);

		if (bilan) {
			await updateBilanGain(db, bilan.id_bilan, parsed);
		} else if (id_profil_inv !== null) {
			await addBilan(db, id_profil_inv, date, null, parsed, label, couleur);
		}
		await loadBilans();
	}

	const monthTotalInvesti = roundMoney(rows.reduce((sum, r) => sum + (r.bilan?.valeur ?? 0), 0));
	const monthTotalGain = roundMoney(rows.reduce((sum, r) => sum + (r.bilan?.gain ?? 0), 0));

	// Sur TOUS les bilans, enveloppes supprimées ("fantômes") incluses : l'argent déjà investi
	// dans une enveloppe depuis supprimée compte toujours dans le patrimoine réel.
	const totalInvesti = roundMoney(bilans.reduce((sum, b) => sum + (b.valeur ?? 0), 0));
	const gainTotal = roundMoney(bilans.reduce((sum, b) => sum + (b.gain ?? 0), 0));
	const valeurActuelle = roundMoney(totalInvesti + gainTotal);
	const recap = [
		{ label: 'Total investi', value: totalInvesti + ' €' },
		{ label: 'Gain total', value: gainTotal + ' €' },
		{ label: 'Patrimoine actuel', value: valeurActuelle + ' €' },
		{ label: 'Moy. gain / mois', value: roundMoney(gainTotal / 12) + ' €' },
	];

	return (
		<ScrollView contentContainerStyle={styles.container}>
			<ScreenHeader title="Suivi" />
			<Text style={styles.subtitle}>Saisis la vraie valeur de chaque compte, mois par mois</Text>

			<View style={styles.patrimoineCard}>
				<Text style={styles.patrimoineLabel}>Valeur actuelle du patrimoine</Text>
				<Text style={styles.patrimoineValue}>{valeurActuelle} €</Text>
			</View>

			{yearPickerOpen && (
				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChips}>
					{yearOptions.map((y) => (
						<TouchableOpacity
							key={y}
							style={[styles.monthChip, y === year && styles.monthChipActive]}
							onPress={() => { setYear(y); setYearPickerOpen(false); }}
						>
							<Text style={[styles.monthChipText, y === year && styles.monthChipTextActive]}>{y}</Text>
						</TouchableOpacity>
					))}
				</ScrollView>
			)}

			<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChips}>
				{MONTH_LABELS.map((label, index) => (
					<TouchableOpacity
						key={label}
						style={[styles.monthChip, index === selMonth && styles.monthChipActive]}
						onPress={() => setSelMonth(index)}
					>
						<Text style={[styles.monthChipText, index === selMonth && styles.monthChipTextActive]}>{label}</Text>
					</TouchableOpacity>
				))}
			</ScrollView>

			<View style={styles.monthHeader}>
				<TouchableOpacity onPress={() => setYearPickerOpen((v) => !v)}>
					<Text style={styles.sectionLabel}>{MONTH_LABELS[selMonth]} {year} ▾</Text>
				</TouchableOpacity>
				<View style={styles.monthHeaderTotals}>
					<Text style={styles.monthHeaderTotal}>{monthTotalInvesti} €</Text>
					<Text style={[styles.monthHeaderTotal, styles.monthHeaderTotalGain]}>+{monthTotalGain} €</Text>
				</View>
			</View>

			<View style={styles.accountsList}>
				{rows.length === 0 ? (
					<Text style={styles.emptyText}>Aucune enveloppe — ajoutez-en une ci-dessous</Text>
				) : (
					rows.map((row) => {
						const key = draftKey(row.id_profil_inv, date, row.bilan?.id_bilan ?? null);
						const valeurText = valeurDrafts[key] ?? (row.bilan?.valeur == null ? '' : String(row.bilan.valeur));
						const gainText = gainDrafts[key] ?? (row.bilan?.gain == null ? '' : String(row.bilan.gain));
						return (
							<Bubble key={row.key} style={styles.accountCard}>
								<View style={styles.accountHeader}>
									<View style={[styles.dot, { backgroundColor: `#${row.couleur}` }]} />
									<Text style={styles.accountLabel}>{row.label}</Text>
									{row.ghost && <Text style={styles.ghostTag}>enveloppe supprimée</Text>}
									{row.bilan && (
										<TouchableOpacity onPress={() => handleDeleteBilan(row.id_profil_inv, row.bilan!.id_bilan, row.label)}>
											<Text style={styles.deleteBilanText}>Supprimer</Text>
										</TouchableOpacity>
									)}
								</View>
								<View style={styles.fieldsRow}>
									<View style={styles.field}>
										<Text style={styles.fieldLabel}>Valeur</Text>
										<View style={[styles.fieldInputWrap, { borderBottomColor: `#${row.couleur}` }]}>
											<TextInput
												style={styles.fieldInput}
												value={valeurText}
												onChangeText={(text) => handleValeurChange(row.id_profil_inv, row.label, row.couleur, row.bilan, text)}
												inputMode="decimal"
												placeholder="0"
												placeholderTextColor={colors.textSecondary}
											/>
											<Text style={styles.fieldCurrency}>€</Text>
										</View>
									</View>
									<View style={styles.field}>
										<Text style={styles.fieldLabel}>Gain</Text>
										<View style={styles.fieldInputWrap}>
											<TextInput
												style={[styles.fieldInput, styles.gainInput]}
												value={gainText}
												onChangeText={(text) => handleGainChange(row.id_profil_inv, row.label, row.couleur, row.bilan, text)}
												inputMode="decimal"
												placeholder="0"
												placeholderTextColor={colors.textSecondary}
											/>
											<Text style={styles.fieldCurrency}>€</Text>
										</View>
									</View>
								</View>
							</Bubble>
						);
					})
				)}
				<TouchableOpacity style={styles.addRow} onPress={handleAddEnvelope}>
					<Text style={styles.addRowText}>+ Ajouter une enveloppe</Text>
				</TouchableOpacity>
			</View>

			<Text style={[styles.sectionLabel, styles.recapLabel]}>Récapitulatif de l'année</Text>
			<View style={styles.recapGrid}>
				{recap.map((r) => (
					<Bubble key={r.label} style={styles.recapCard}>
						<Text style={styles.recapCardLabel}>{r.label}</Text>
						<Text style={styles.recapCardValue}>{r.value}</Text>
					</Bubble>
				))}
			</View>
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
	patrimoineCard: {
		marginTop: 18,
		backgroundColor: colors.textPrimary,
		borderRadius: radius.bubble,
		paddingVertical: 18,
		paddingHorizontal: 20,
		alignItems: 'center',
	},
	patrimoineLabel: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.border,
		textTransform: 'uppercase',
		letterSpacing: 0.4,
	},
	patrimoineValue: {
		fontSize: 32,
		fontWeight: '700',
		color: colors.white,
		marginTop: 4,
	},
	monthChips: {
		gap: 6,
		marginTop: 18,
		paddingBottom: 4,
	},
	monthChip: {
		paddingVertical: 7,
		paddingHorizontal: 12,
		borderRadius: 10,
		backgroundColor: colors.accentBg,
	},
	monthChipActive: {
		backgroundColor: colors.highlight,
	},
	monthChipText: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textSecondary,
	},
	monthChipTextActive: {
		color: colors.white,
	},
	sectionLabel: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textSecondary,
		textTransform: 'uppercase',
		letterSpacing: 0.4,
		marginTop: 18,
	},
	monthHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	monthHeaderTotals: {
		flexDirection: 'row',
		gap: 10,
		marginTop: 18,
	},
	monthHeaderTotal: {
		fontSize: 14,
		fontWeight: '700',
		color: colors.textPrimary,
	},
	monthHeaderTotalGain: {
		color: colors.accent,
	},
	accountsList: {
		gap: 10,
		marginTop: 10,
	},
	accountCard: {
		paddingVertical: 12,
	},
	accountHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
	dot: {
		width: 10,
		height: 10,
		borderRadius: 3,
	},
	accountLabel: {
		flex: 1,
		fontSize: 15,
		fontWeight: '600',
		color: colors.textPrimary,
	},
	ghostTag: {
		fontSize: 11,
		fontWeight: '600',
		color: colors.textSecondary,
		fontStyle: 'italic',
	},
	deleteBilanText: {
		fontSize: 12,
		fontWeight: '600',
		color: '#c2482d',
	},
	fieldsRow: {
		flexDirection: 'row',
		gap: 12,
		marginTop: 10,
	},
	field: {
		flex: 1,
	},
	fieldLabel: {
		fontSize: 11,
		fontWeight: '600',
		color: colors.textSecondary,
		textTransform: 'uppercase',
		letterSpacing: 0.3,
	},
	fieldInputWrap: {
		flexDirection: 'row',
		alignItems: 'baseline',
		gap: 2,
		marginTop: 3,
		borderBottomWidth: 1.5,
		borderBottomColor: colors.border,
	},
	fieldInput: {
		flex: 1,
		fontSize: 16,
		fontWeight: '700',
		color: colors.textPrimary,
		padding: 0,
		paddingVertical: 2,
	},
	gainInput: {
		color: colors.accent,
		fontWeight: '600',
	},
	fieldCurrency: {
		fontSize: 13,
		color: colors.textSecondary,
	},
	emptyText: {
		fontSize: 14,
		color: colors.textSecondary,
		paddingVertical: 20,
		textAlign: 'center',
	},
	addRow: {
		paddingVertical: 12,
	},
	addRowText: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textSecondary,
	},
	recapLabel: {
		marginTop: 28,
		marginBottom: 10,
	},
	recapGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 12,
	},
	recapCard: {
		width: '47%',
		paddingVertical: 14,
	},
	recapCardLabel: {
		fontSize: 12,
		color: colors.textSecondary,
		fontWeight: '600',
	},
	recapCardValue: {
		fontSize: 20,
		fontWeight: '700',
		color: colors.textPrimary,
		marginTop: 4,
	},
});
