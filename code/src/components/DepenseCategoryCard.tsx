import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import Bubble from './Bubble';
import EditableRow from './EditableRow';
import { useDb } from '../db/DbContext';
import { getDepenses, addDepense, updateDepenseLabel, updateDepenseValeur, updateDepenseOrdre, deleteDepense, Depense } from '../db/queries';
import { colors } from '../theme';
import { roundMoney } from '../utils/money';

type Props = {
	groupId: number;
	label: string;
	couleur: string | null;
	onLabelChange: (text: string) => void;
	onRemove: () => void;
	onChange?: () => void;
	onDrag?: () => void;
	dragActive?: boolean;
};

export default function DepenseCategoryCard({ groupId, label, couleur, onLabelChange, onRemove, onChange, onDrag, dragActive }: Props) {
	const db = useDb();
	const [open, setOpen] = useState(false);
	const [depenses, setDepenses]			= useState<Depense[]>([]);
	const [total, setTotal]				= useState(0);
	const [amountDrafts, setAmountDrafts]	= useState<Record<number, string>>({});

	async function loadDepenses() {
		const all = await getDepenses(db);
		const list = all.filter((d) => d.id_depense_group === groupId);
		setDepenses(list);
		setTotal(roundMoney(list.reduce((sum, d) => sum + (d.valeur ?? 0), 0)));
	}

	useEffect(() => {
		loadDepenses();
	}, [])

	async function handleAddDepense() {
		const maxOrdre = depenses.reduce((max, d) => Math.max(max, d.ordre ?? -1), -1);
		await addDepense(db, 'Nouvelle dépense', groupId, null, maxOrdre + 1);
		await loadDepenses();
		onChange?.();
	}

	function handleLabelChange(id: number, text: string) {
		setDepenses((prev) => prev.map((d) => (d.id_depense === id ? { ...d, label: text } : d)));
		updateDepenseLabel(db, id, text);
	}

	function handleValeurChange(id: number, text: string) {
		setAmountDrafts((prev) => ({ ...prev, [id]: text }));

		const parsed = text === '' ? null : Number(text.replace(',', '.'));
		if (parsed !== null && isNaN(parsed)) return;

		const updated = depenses.map((d) => (d.id_depense === id ? { ...d, valeur: parsed } : d));
		setDepenses(updated);
		setTotal(roundMoney(updated.reduce((sum, d) => sum + (d.valeur ?? 0), 0)));
		updateDepenseValeur(db, id, parsed);
		onChange?.();
	}

	async function handleReorder(data: Depense[]) {
		setDepenses(data);
		await Promise.all(data.map((d, index) => updateDepenseOrdre(db, d.id_depense, index)));
		onChange?.();
	}

	function handleRemoveDepense(id: number) {
		Alert.alert(
			'Supprimer cette dépense ?',
			'Cette action est irréversible.',
			[
				{ text: 'Annuler', style: 'cancel' },
				{
					text: 'Supprimer',
					style: 'destructive',
					onPress: async () => {
						await deleteDepense(db, id);
						await loadDepenses();
						onChange?.();
					},
				},
			]
		);
	}

	const tintColor = couleur ? `#${couleur}` : colors.border;
	const tintBg = couleur ? `#${couleur}26` : colors.background; // ~15% opacité

	return (
		<Bubble style={[styles.card, { backgroundColor: tintBg }, dragActive && styles.cardActive]}>
			<TouchableOpacity style={styles.header} onPress={() => setOpen(!open)}>
				{onDrag ? (
					<TouchableOpacity onLongPress={onDrag} hitSlop={8}>
						<Text style={[styles.dragHandle, { color: tintColor }]}>☰</Text>
					</TouchableOpacity>
				) : null}
				<View style={[styles.colorDot, { backgroundColor: tintColor }]} />
				<TextInput
					style={[styles.labelInput, { color: tintColor }]}
					value={label}
					onChangeText={onLabelChange}
				/>
				<Text style={[styles.total, { color: tintColor }]}>{total} €</Text>
				<Text style={[styles.chevron, { color: tintColor }]}>{open ? '˅' : '˃'}</Text>
				<TouchableOpacity onPress={onRemove} hitSlop={8}>
					<Text style={styles.removeText}>×</Text>
				</TouchableOpacity>
			</TouchableOpacity>

			{open ? (
				<DraggableFlatList
					data={[...depenses].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))}
					keyExtractor={(d) => String(d.id_depense)}
					scrollEnabled={false}
					onDragEnd={({ data }) => handleReorder(data)}
					renderItem={({ item: depense, drag, isActive }: RenderItemParams<Depense>) => (
						<EditableRow
							label={depense.label}
							value={amountDrafts[depense.id_depense] ?? (depense.valeur === null ? '' : String(depense.valeur))}
							onLabelChange={(text) => handleLabelChange(depense.id_depense, text)}
							onValueChange={(text) => handleValeurChange(depense.id_depense, text)}
							onRemove={() => handleRemoveDepense(depense.id_depense)}
							onDrag={drag}
							dragActive={isActive}
						/>
					)}
					ListFooterComponent={
						<TouchableOpacity style={styles.addRow} onPress={handleAddDepense}>
							<Text style={styles.addRowText}>+ Ajouter une dépense</Text>
						</TouchableOpacity>
					}
				/>
			) : null}
		</Bubble>
	);
}

const styles = StyleSheet.create({
	card: {
		paddingVertical: 4,
	},
	cardActive: {
		opacity: 0.6,
	},
	dragHandle: {
		fontSize: 14,
		paddingRight: 2,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingVertical: 12,
	},
	colorDot: {
		width: 14,
		height: 14,
		borderRadius: 5,
	},
	labelInput: {
		flex: 1,
		fontSize: 15,
		fontWeight: '700',
		padding: 0,
	},
	total: {
		fontSize: 15,
		fontWeight: '700',
	},
	chevron: {
		fontSize: 12,
	},
	removeText: {
		fontSize: 16,
		color: colors.textSecondary,
		paddingHorizontal: 4,
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
