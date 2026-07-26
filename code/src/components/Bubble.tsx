import { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
};

export default function Bubble({ children, style }: Props) {
	return <View style={[styles.bubble, style]}>{children}</View>;
}

const styles = StyleSheet.create({
	bubble: {
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radius.bubble,
		paddingHorizontal: 18,
	},
});
