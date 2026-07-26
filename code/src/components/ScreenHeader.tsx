import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';

type Props = {
	monthLabel?:		string;
	title:				string;
	onSettingsPress?:	() => void;
};

export default function ScreenHeader({ monthLabel, title, onSettingsPress }: Props) {
	return (
		<View style={styles.row}>
			<View style={styles.viewStyle}>
				<Text style={styles.title}>{title}</Text>
				{ monthLabel && <Text style={styles.monthLabel}>{monthLabel}</Text> }
			</View>
			{onSettingsPress && (
				<TouchableOpacity style={styles.settingsButton} onPress={onSettingsPress}>
					<Text style={styles.settingsIcon}>⚙</Text>
				</TouchableOpacity>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
	},
	settingsButton: {
		marginTop: 8,
		padding: 6,
	},
	settingsIcon: {
		fontSize: 22,
		color: colors.textSecondary,
	},
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
