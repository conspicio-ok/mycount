import { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import ScreenHeader from '../components/ScreenHeader';
import ExpandableBubble from '../components/ExpandableBubble';
import Bubble from '../components/Bubble';
import SummaryRow from '../components/SummaryRow';
import EditableRow from '../components/EditableRow';
import DepenseCategoryCard from '../components/DepenseCategoryCard';
import RestCard from '../components/RestCard';
import StatPill from '../components/StatPill';
import { useDb } from '../db/DbContext';
import {
	getRevenus, addRevenu, updateRevenuLabel, updateRevenuValeur, updateRevenuOrdre, deleteRevenu, Revenu,
	getDepenseGroups, addDepenseGroup, updateDepenseGroupLabel, updateDepenseGroupOrdre, deleteDepenseGroup, DepenseGroup,
	getDepenses,
} from '../db/queries';
import { colors } from '../theme';
import { roundMoney } from '../utils/money';

const CATEGORY_COLORS = ['7c5cd6', 'e08a3c', '3c8ae0', 'd6485c', '3ab08a'];

export default function HomeScreen() {
	const db = useDb();

	const [revenusOpen, setRevenusOpen] = useState(false);
	const [revenus, setRevenus]			= useState<Revenu[]>([]);
	const [totalRevenu, setTotalRevenu]	= useState(0);
	const [amountDrafts, setAmountDrafts]	= useState<Record<number, string>>({});

	const [groups, setGroups] = useState<DepenseGroup[]>([]);
	const [depenseTotals, setDepenseTotals] = useState<Record<number, number>>({});

	async function loadRevenus() {
		const list = await getRevenus(db);
		setRevenus(list);
		setTotalRevenu(roundMoney(list.reduce((sum, r) => sum + (r.valeur ?? 0), 0)));
	}

	async function loadGroups() {
		setGroups(await getDepenseGroups(db));
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

	useEffect(() => {
		loadRevenus();
		loadGroups();
		loadDepenseTotals();
	}, [])

	async function handleAddRevenu() {
		const maxOrdre = revenus.reduce((max, r) => Math.max(max, r.ordre ?? -1), -1);
		await addRevenu(db, 'Nouveau revenu', null, maxOrdre + 1);
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
		const couleur = CATEGORY_COLORS[groups.length % CATEGORY_COLORS.length];
		await addDepenseGroup(db, 'Nouvelle catégorie', couleur, maxOrdre + 1);
		await loadGroups();
	}

	function handleGroupLabelChange(id: number, text: string) {
		setGroups((prev) => prev.map((g) => (g.id_depense_group === id ? { ...g, label: text } : g)));
		updateDepenseGroupLabel(db, id, text);
	}

	async function handleRemoveGroup(id: number) {
		await deleteDepenseGroup(db, id);
		await loadGroups();
		await loadDepenseTotals();
	}

	async function handleReorderGroups(data: DepenseGroup[]) {
		setGroups(data);
		await Promise.all(data.map((g, index) => updateDepenseGroupOrdre(db, g.id_depense_group, index)));
	}

	const sortedGroups = [...groups].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
	const totalDepenses = roundMoney(Object.values(depenseTotals).reduce((sum, v) => sum + v, 0));
	const reste = roundMoney(totalRevenu - totalDepenses);
	const revenusAnnuel = roundMoney(totalRevenu * 12);

	return (
		<KeyboardAvoidingView
			style={styles.flex}
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			keyboardVerticalOffset={0}
		>
		<ScrollView contentContainerStyle={styles.container}>
			<ScreenHeader monthLabel="Juillet 2026" title="Mon budget" />

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
				<StatPill label="Taux d'épargne" value="52%" />
				<StatPill label="Dépenses / mois" value={totalDepenses + ' €'} />
			</View>
			<View style={styles.pillRow}>
				<StatPill label="Investi / an" value="3 600 €" />
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
});
