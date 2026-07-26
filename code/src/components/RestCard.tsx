import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
	label: string;
	value: string;
};

export default function RestCard({ label, value }: Props) {
	return (
		<View style={styles.card}>
			<Text style={styles.label}>{label}</Text>
			<Text style={styles.value}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.highlight,
		borderRadius: radius.bubble,
		paddingVertical: 18,
		paddingHorizontal: 20,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	label: {
		fontSize: 14,
		fontWeight: '600',
		color: colors.highlightText,
		textTransform: 'uppercase',
		letterSpacing: 0.4,
	},
	value: {
		fontSize: 28,
		fontWeight: '700',
		color: colors.white,
	},
});
