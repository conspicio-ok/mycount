import { useState, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import ScreenHeader from '../components/ScreenHeader';
import ExpandableBubble from '../components/ExpandableBubble';
import Bubble from '../components/Bubble';
import BottomSheet from '../components/BottomSheet';
import { dumpDatabase, restoreDatabase } from '../utils/backup';
import SummaryRow from '../components/SummaryRow';
import EditableRow from '../components/EditableRow';
import DepenseCategoryCard from '../components/DepenseCategoryCard';
import RestCard from '../components/RestCard';
import StatPill from '../components/StatPill';
import { useDb } from '../db/DbContext';
import {
	getRevenus, addRevenu, updateRevenuLabel, updateRevenuValeur, updateRevenuOrdre, deleteRevenu, Revenu,
	getDepenseGroups, addDepenseGroup, updateDepenseGroupLabel, updateDepenseGroupOrdre, updateDepenseGroupCouleur, deleteDepenseGroup, DepenseGroup,
	getDepenses, getProfilsInvest, getActions,
} from '../db/queries';
import { colors } from '../theme';
import { roundMoney } from '../utils/money';
import { getMonthLabel } from '../utils/date';
import { investMensuelEuros } from '../utils/invest';

const CATEGORY_COLORS = ['7c5cd6', 'e08a3c', '3c8ae0', 'd6485c', '3ab08a'];

export default function HomeScreen() {
	const db = useDb();

	const [revenusOpen, setRevenusOpen] = useState(false);
	const [revenus, setRevenus]			= useState<Revenu[]>([]);
	const [totalRevenu, setTotalRevenu]	= useState(0);
	const [amountDrafts, setAmountDrafts]	= useState<Record<number, string>>({});

	const [groups, setGroups] = useState<DepenseGroup[]>([]);
	const [depenseTotals, setDepenseTotals] = useState<Record<number, number>>({});

	const [investTotalMensuel, setInvestTotalMensuel] = useState(0);
	const [settingsOpen, setSettingsOpen] = useState(false);

	async function loadRevenus() {
		const list = await getRevenus(db);
		setRevenus(list);
		setTotalRevenu(roundMoney(list.reduce((sum, r) => sum + (r.valeur ?? 0), 0)));
	}

	async function loadGroups() {
		const list = await getDepenseGroups(db);
		const sorted = [...list].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
		// +1 : la couleur 0 (colors.highlight) est déjà utilisée par la ligne "Investissement"
		const corrected = await Promise.all(sorted.map(async (group, index) => {
			const couleur = CATEGORY_COLORS[(index + 1) % CATEGORY_COLORS.length];
			if (group.couleur !== couleur) {
				await updateDepenseGroupCouleur(db, group.id_depense_group, couleur);
				return { ...group, couleur };
			}
			return group;
		}));
		setGroups(corrected);
	}

	async function loadDepenseTotals() {
		const depenses = await getDepenses(db);
		const totals: Record<number, number> = {};
		for (const d of depenses) {
			totals[d.id_depense_group] = (totals[d.id_depense_group] ?? 0) + (d.valeur ?? 0);
		}
		for (const id in totals) {
			totals[id] = roundMoney(totals[id]);
		}
		setDepenseTotals(totals);
	}

	async function loadInvestTotal() {
		const profils = await getProfilsInvest(db);
		const actions = await getActions(db);
		const total = profils.reduce(
			(sum, p) => sum + actions.filter((a) => a.id_profil_inv === p.id_profil_inv).reduce((s, a) => s + investMensuelEuros(a, p.style_acquisition), 0),
			0
		);
		setInvestTotalMensuel(roundMoney(total));
	}

	useFocusEffect(
		useCallback(() => {
			loadRevenus();
			loadGroups();
			loadDepenseTotals();
			loadInvestTotal();
		}, [])
	);

	async function handleExport() {
		setSettingsOpen(false);
		try {
			const data = await dumpDatabase(db);
			const file = new File(Paths.cache, `mycount-backup-${Date.now()}.json`);
			file.write(JSON.stringify(data, null, 2));
			if (await Sharing.isAvailableAsync()) {
				await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Exporter mes données' });
			} else {
				Alert.alert('Export', `Fichier écrit : ${file.uri}`);
			}
		} catch {
			Alert.alert('Erreur', "L'export a échoué.");
		}
	}

	async function reloadAll() {
		await loadRevenus();
		await loadGroups();
		await loadDepenseTotals();
		await loadInvestTotal();
	}

	async function handleImport() {
		setSettingsOpen(false);
		let data: unknown;
		try {
			const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
			if (result.canceled) return;
			data = JSON.parse(await new File(result.assets[0].uri).text());
		} catch {
			Alert.alert('Erreur', "Le fichier sélectionné n'est pas lisible.");
			return;
		}

		Alert.alert(
			'Importer ces données ?',
			'Toutes les données actuelles seront remplacées par celles du fichier.',
			[
				{ text: 'Annuler', style: 'cancel' },
				{
					text: 'Importer',
					style: 'destructive',
					onPress: async () => {
						try {
							await restoreDatabase(db, data as Parameters<typeof restoreDatabase>[1]);
							await reloadAll();
							Alert.alert('Import réussi', 'Les données ont été restaurées.');
						} catch {
							Alert.alert('Erreur', "L'import a échoué — le fichier n'est probablement pas une sauvegarde valide.");
						}
					},
				},
			]
		);
	}

	async function handleAddRevenu() {
		const maxOrdre = revenus.reduce((max, r) => Math.max(max, r.ordre ?? -1), -1);
		await addRevenu(db, 'Nouveau revenu', 0, maxOrdre + 1);
		await loadRevenus();
	}

	function handleLabelChange(id: number, text: string) {
		setRevenus((prev) => prev.map((r) => (r.id_revenu === id ? { ...r, label: text } : r)));
		updateRevenuLabel(db, id, text);
	}

	function handleValeurChange(id: number, text: string) {
		setAmountDrafts((prev) => ({ ...prev, [id]: text }));

		const parsed = text === '' ? null : Number(text.replace(',', '.'));
		if (parsed !== null && isNaN(parsed)) return;

		const updated = revenus.map((r) => (r.id_revenu === id ? { ...r, valeur: parsed } : r));
		setRevenus(updated);
		setTotalRevenu(roundMoney(updated.reduce((sum, r) => sum + (r.valeur ?? 0), 0)));
		updateRevenuValeur(db, id, parsed);
	}

	async function handleReorderRevenus(data: Revenu[]) {
		setRevenus(data);
		await Promise.all(data.map((r, index) => updateRevenuOrdre(db, r.id_revenu, index)));
	}

	function handleRemoveRevenu(id: number) {
		Alert.alert(
			'Supprimer ce revenu ?',
			'Cette action est irréversible.',
			[
				{ text: 'Annuler', style: 'cancel' },
				{
					text: 'Supprimer',
					style: 'destructive',
					onPress: async () => {
						await deleteRevenu(db, id);
						await loadRevenus();
					},
				},
			]
		);
	}

	async function handleAddGroup() {
		const maxOrdre = groups.reduce((max, g) => Math.max(max, g.ordre ?? -1), -1);
		const couleur = CATEGORY_COLORS[(groups.length + 1) % CATEGORY_COLORS.length];
		await addDepenseGroup(db, 'Nouvelle catégorie', couleur, maxOrdre + 1);
		await loadGroups();
	}

	function handleGroupLabelChange(id: number, text: string) {
		setGroups((prev) => prev.map((g) => (g.id_depense_group === id ? { ...g, label: text } : g)));
		updateDepenseGroupLabel(db, id, text);
	}

	function handleRemoveGroup(id: number) {
		Alert.alert(
			'Supprimer cette catégorie ?',
			'Toutes les dépenses de cette catégorie seront supprimées. Cette action est irréversible.',
			[
				{ text: 'Annuler', style: 'cancel' },
				{
					text: 'Supprimer',
					style: 'destructive',
					onPress: async () => {
						try {
							await deleteDepenseGroup(db, id);
							await loadGroups();
							await loadDepenseTotals();
						} catch {
							Alert.alert('Erreur', "La suppression a échoué.");
						}
					},
				},
			]
		);
	}

	async function handleReorderGroups(data: DepenseGroup[]) {
		setGroups(data);
		await Promise.all(data.map((g, index) => updateDepenseGroupOrdre(db, g.id_depense_group, index)));
	}

	const sortedGroups = [...groups].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
	const totalDepenses = roundMoney(Object.values(depenseTotals).reduce((sum, v) => sum + v, 0));
	const reste = roundMoney(totalRevenu - totalDepenses - investTotalMensuel);
	const revenusAnnuel = roundMoney(totalRevenu * 12);
	const investAnnuel = roundMoney(investTotalMensuel * 12);
	const tauxEpargne = totalRevenu > 0 ? roundMoney((investTotalMensuel / totalRevenu) * 100) : 0;

	return (
		<KeyboardAvoidingView
			style={styles.flex}
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			keyboardVerticalOffset={0}
		>
		<ScrollView contentContainerStyle={styles.container}>
			<ScreenHeader monthLabel={getMonthLabel()} title="Mon budget" onSettingsPress={() => setSettingsOpen(true)} />

			<ExpandableBubble
				title="Revenus mensuels"
				value={totalRevenu + ' €'}
				open={revenusOpen}
				onToggle={() => setRevenusOpen(!revenusOpen)}
			>
				<DraggableFlatList
					data={[...revenus].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))}
					keyExtractor={(revenu) => String(revenu.id_revenu)}
					scrollEnabled={false}
					onDragEnd={({ data }) => handleReorderRevenus(data)}
					renderItem={({ item: revenu, drag, isActive }: RenderItemParams<Revenu>) => (
						<EditableRow
							label={revenu.label}
							value={amountDrafts[revenu.id_revenu] ?? (revenu.valeur === null ? '' : String(revenu.valeur))}
							onLabelChange={(text) => handleLabelChange(revenu.id_revenu, text)}
							onValueChange={(text) => handleValeurChange(revenu.id_revenu, text)}
							onRemove={() => handleRemoveRevenu(revenu.id_revenu)}
							onDrag={drag}
							dragActive={isActive}
						/>
					)}
					ListFooterComponent={
						<TouchableOpacity style={styles.addRow} onPress={handleAddRevenu}>
							<Text style={styles.addRowText}>+ Ajouter un revenu</Text>
						</TouchableOpacity>
					}
				/>
			</ExpandableBubble>

			<Bubble>
				<SummaryRow
					color={colors.highlight}
					label="Investissement"
					value={investTotalMensuel + ' €'}
				/>
				{sortedGroups.map((group) => (
					<SummaryRow
						key={group.id_depense_group}
						color={group.couleur ? `#${group.couleur}` : undefined}
						label={group.label}
						value={(depenseTotals[group.id_depense_group] ?? 0) + ' €'}
					/>
				))}
			</Bubble>

			<RestCard label="Reste" value={reste + ' €'} />

			<View style={styles.pillRow}>
				<StatPill label="Taux d'épargne" value={tauxEpargne + '%'} />
				<StatPill label="Dépenses / mois" value={totalDepenses + ' €'} />
			</View>
			<View style={styles.pillRow}>
				<StatPill label="Investi / an" value={investAnnuel + ' €'} />
				<StatPill label="Revenus / an" value={revenusAnnuel + ' €'} />
			</View>

			<View style={styles.detailHeader}>
				<Text style={styles.detailTitle}>Détail des dépenses</Text>
				<Text style={styles.detailTotal}>{totalDepenses} €</Text>
			</View>
			<DraggableFlatList
				data={sortedGroups}
				keyExtractor={(group) => String(group.id_depense_group)}
				scrollEnabled={false}
				contentContainerStyle={styles.categoriesList}
				onDragEnd={({ data }) => handleReorderGroups(data)}
				renderItem={({ item: group, drag, isActive }: RenderItemParams<DepenseGroup>) => (
					<DepenseCategoryCard
						groupId={group.id_depense_group}
						label={group.label}
						couleur={group.couleur}
						onLabelChange={(text) => handleGroupLabelChange(group.id_depense_group, text)}
						onRemove={() => handleRemoveGroup(group.id_depense_group)}
						onChange={loadDepenseTotals}
						onDrag={drag}
						dragActive={isActive}
					/>
				)}
				ListFooterComponent={
					<TouchableOpacity style={styles.addRow} onPress={handleAddGroup}>
						<Text style={styles.addRowText}>+ Ajouter une catégorie</Text>
					</TouchableOpacity>
				}
			/>
		</ScrollView>

		<BottomSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)}>
			<Text style={styles.sheetTitle}>Réglages</Text>
			<TouchableOpacity style={styles.settingsRow} onPress={handleExport}>
				<Text style={styles.settingsRowText}>Exporter mes données</Text>
			</TouchableOpacity>
			<TouchableOpacity style={styles.settingsRow} onPress={handleImport}>
				<Text style={styles.settingsRowText}>Importer des données</Text>
			</TouchableOpacity>
		</BottomSheet>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	container: {
		padding: 20,
		gap: 16,
	},
	pillRow: {
		flexDirection: 'row',
		gap: 12,
	},
	detailHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'baseline',
		marginTop: 10,
	},
	detailTitle: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.textSecondary,
		textTransform: 'uppercase',
		letterSpacing: 0.4,
	},
	detailTotal: {
		fontSize: 14,
		fontWeight: '700',
		color: colors.textPrimary,
	},
	categoriesList: {
		gap: 16,
	},
	addRow: {
		paddingVertical: 12,
	},
	addRowText: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textSecondary,
	},
	sheetTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: colors.textPrimary,
		marginBottom: 12,
	},
	settingsRow: {
		paddingVertical: 14,
		borderBottomWidth: 1,
		borderBottomColor: colors.divider,
	},
	settingsRowText: {
		fontSize: 15,
		fontWeight: '600',
		color: colors.textPrimary,
	},
});
