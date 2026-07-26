import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

type Props = {
	monthLabel?:	string;
	title:			string;
};

export default function ScreenHeader({ monthLabel, title }: Props) {
	return (
		<View style={styles.viewStyle}>
			{ monthLabel && <Text style={styles.monthLabel}>{monthLabel}</Text> }
			<Text style={styles.title}>{title}</Text>
		</View>
	);
}

const styles = StyleSheet.create({

	viewStyle: {
		marginTop: 8,
	},
	monthLabel: {
		fontSize: 15,
		color: colors.textSecondary,
		fontWeight: '500',
	},
	title: {
		fontSize: 26,
		fontWeight: '700',
		color: colors.textPrimary,
	},
});
