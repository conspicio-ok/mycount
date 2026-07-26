import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Bubble from './Bubble';
import { colors } from '../theme';

type Props = {
	title: string;
	value: string;
	open: boolean;
	onToggle: () => void;
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
};

export default function ExpandableBubble({ title, value, open, onToggle, children, style }: Props) {
	return (
		<Bubble style={[styles.bubble, style]}>
			<TouchableOpacity style={styles.header} onPress={onToggle}>
				<View style={styles.headerLeft}>
					<Text style={styles.chevron}>{open ? '˅' : '˃'}</Text>
					<Text style={styles.title}>{title}</Text>
				</View>
				<Text style={styles.value}>{value}</Text>
			</TouchableOpacity>
			{open ? <View style={styles.content}>{children}</View> : null}
		</Bubble>
	);
}

const styles = StyleSheet.create({
	bubble: {
		backgroundColor: colors.accentBg,
		paddingVertical: 4,
		margin: 2,
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingVertical: 12,
	},
	headerLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	chevron: {
		fontSize: 12,
		color: colors.accent,
	},
	title: {
		fontSize: 13,
		fontWeight: '600',
		color: colors.accent,
		textTransform: 'uppercase',
		letterSpacing: 0.4,
	},
	value: {
		fontSize: 22,
		fontWeight: '700',
		color: colors.accent,
	},
	content: {
		paddingBottom: 8,
	},
});
