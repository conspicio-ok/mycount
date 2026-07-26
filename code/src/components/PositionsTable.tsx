import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import Bubble from './Bubble';
import { Action } from '../db/queries';
import { computeRendNet, computeRendAn } from '../utils/invest';
import { colors } from '../theme';

type Props = {
	positions:			Action[];
	taux:				number;
	couleur:			string;
	moisByAction:		Record<number, number[]>;
	onSelectPosition:	(id_action: number) => void;
	onReorder:			(data: Action[]) => void;
};

function PositionsTable({ positions, taux, couleur, moisByAction, onSelectPosition, onReorder }: Props) {
	return (
		<Bubble style={styles.table}>
			<View style={styles.tableHeader}>
				<Text style={[styles.cellLabel, styles.headerText]}>Nom</Text>
				<Text style={[styles.cell, styles.headerText]}>Rdt net</Text>
				<Text style={[styles.cell, styles.headerText]}>Rdt / an</Text>
			</View>
			{positions.length === 0 ? (
				<Text style={styles.emptyText}>Aucune position — ajoutez-en une ci-dessous</Text>
			) : (
				<DraggableFlatList
					data={positions}
					keyExtractor={(a) => String(a.id_action)}
					scrollEnabled={false}
					onDragEnd={({ data }) => onReorder(data)}
					renderItem={({ item: action, drag, isActive }: RenderItemParams<Action>) => {
						const moisCount = (moisByAction[action.id_action] ?? []).length;
						return (
							<TouchableOpacity
								style={[styles.tableRow, isActive && styles.tableRowActive]}
								onPress={() => onSelectPosition(action.id_action)}
								onLongPress={drag}
							>
								<Text style={[styles.cellLabel, styles.cellText]} numberOfLines={1}>{action.label}</Text>
								<Text style={styles.cell}>{computeRendNet(action, moisCount, taux)}%</Text>
								<Text style={[styles.cell, { color: `#${couleur}`, fontWeight: '700' }]}>{computeRendAn(action, moisCount, taux)} €</Text>
							</TouchableOpacity>
						);
					}}
				/>
			)}
		</Bubble>
	);
}

export default memo(PositionsTable);

const styles = StyleSheet.create({
	table: {
		marginTop: 12,
		paddingVertical: 4,
	},
	tableHeader: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: colors.divider,
		paddingVertical: 10,
	},
	tableRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.divider,
	},
	tableRowActive: {
		opacity: 0.6,
	},
	cell: {
		flex: 1,
		fontSize: 14,
		color: colors.textPrimary,
		textAlign: 'right',
	},
	cellLabel: {
		flex: 1.6,
		textAlign: 'left',
	},
	cellText: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.textPrimary,
	},
	headerText: {
		fontSize: 11,
		fontWeight: '700',
		color: colors.textSecondary,
		textTransform: 'uppercase',
	},
	emptyText: {
		fontSize: 14,
		color: colors.textSecondary,
		paddingVertical: 20,
		textAlign: 'center',
	},
});
