import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';

type Props = {
	label: string;
	value: string;
	onLabelChange: (text: string) => void;
	onValueChange: (text: string) => void;
	onRemove: () => void;
	onDrag?: () => void;
	dragActive?: boolean;
};

export default function EditableRow({ label, value, onLabelChange, onValueChange, onRemove, onDrag, dragActive }: Props) {
	return (
		<View style={[styles.row, dragActive && styles.rowActive]}>
			<TouchableOpacity style={styles.dragHandle} onLongPress={onDrag} disabled={!onDrag}>
				<Text style={styles.dragHandleText}>☰</Text>
			</TouchableOpacity>
			<TouchableOpacity style={styles.removeButton} onPress={onRemove}>
				<Text style={styles.removeButtonText}>×</Text>
			</TouchableOpacity>
			<TextInput
				style={styles.label}
				value={label}
				onChangeText={onLabelChange}
			/>
			<View style={styles.amountWrap}>
				<TextInput
					style={styles.amount}
					value={value}
					onChangeText={onValueChange}
					inputMode="decimal"
					placeholder="0"
				/>
				<Text style={styles.currency}>€</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.divider,
	},
	rowActive: {
		opacity: 0.6,
	},
	dragHandle: {
		paddingHorizontal: 2,
	},
	dragHandleText: {
		fontSize: 16,
		color: colors.textSecondary,
	},
	removeButton: {
		width: 20,
		height: 20,
		borderRadius: 999,
		backgroundColor: colors.border,
		alignItems: 'center',
		justifyContent: 'center',
	},
	removeButtonText: {
		fontSize: 13,
		color: colors.textSecondary,
		lineHeight: 14,
	},
	label: {
		flex: 1,
		fontSize: 15,
		fontWeight: '500',
		color: colors.textPrimary,
		padding: 0,
	},
	amountWrap: {
		flexDirection: 'row',
		alignItems: 'baseline',
		gap: 2,
	},
	amount: {
		fontSize: 16,
		fontWeight: '600',
		color: colors.textPrimary,
		textAlign: 'right',
		minWidth: 50,
		padding: 0,
	},
	currency: {
		fontSize: 14,
		color: colors.textSecondary,
	},
});
