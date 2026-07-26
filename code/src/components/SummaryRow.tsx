import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

type Props = {
	color?:	string;
	label:	string;
	value:	string;
};

export default function SummaryRow({ color, label, value }: Props) {
	return (
		<View style={styles.row}>
			<View style={styles.left}>
				{ color && 
					<View style={[styles.dot, { backgroundColor: color }]} />
				}
				<Text style={styles.label}>{label}</Text>
			</View>
			<Text style={styles.value}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 14,
		borderTopWidth: 1,
		borderTopColor: colors.divider,
	},
	left: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
	dot: {
		width: 10,
		height: 10,
		borderRadius: 3,
	},
	label: {
		fontSize: 15,
		fontWeight: '500',
		color: colors.textPrimary,
	},
	value: {
		fontSize: 16,
		fontWeight: '700',
		color: colors.textPrimary,
	},
});
