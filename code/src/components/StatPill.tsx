import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
	label: string;
	value: string;
};

export default function StatPill({ label, value }: Props) {
	return (
		<View style={styles.pill}>
			<Text style={styles.label}>{label}</Text>
			<Text style={styles.value}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		flex: 1,
		minWidth: '45%',
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radius.pill,
		padding: 14,
	},
	label: {
		fontSize: 12,
		color: colors.textSecondary,
		fontWeight: '600',
	},
	value: {
		fontSize: 22,
		fontWeight: '700',
		color: colors.textPrimary,
		marginTop: 4,
	},
});
