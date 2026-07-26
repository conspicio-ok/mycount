import { ReactNode } from 'react';
import { Modal, View, ScrollView, TouchableWithoutFeedback, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { colors } from '../theme';

type Props = {
	visible: boolean;
	onClose: () => void;
	children: ReactNode;
};

export default function BottomSheet({ visible, onClose, children }: Props) {
	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
				<Pressable style={styles.backdrop} onPress={onClose}>
					<TouchableWithoutFeedback>
						<View style={styles.sheet}>
							<View style={styles.handle} />
							<ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
								{children}
							</ScrollView>
						</View>
					</TouchableWithoutFeedback>
				</Pressable>
			</KeyboardAvoidingView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.4)',
		justifyContent: 'flex-end',
	},
	sheet: {
		backgroundColor: colors.white,
		borderTopLeftRadius: 26,
		borderTopRightRadius: 26,
		paddingHorizontal: 20,
		paddingTop: 18,
		maxHeight: '88%',
	},
	scrollArea: {
		flexShrink: 1,
	},
	scrollContent: {
		paddingBottom: 40,
	},
	handle: {
		width: 40,
		height: 4,
		borderRadius: 999,
		backgroundColor: colors.border,
		alignSelf: 'center',
		marginBottom: 16,
	},
});
