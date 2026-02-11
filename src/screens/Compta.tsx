import CashFlow from '@/components/CashFlow';
import { StatusBar } from 'expo-status-bar';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

export default function Compta() {
	let data = {
		entries: [
			{ id: 1, gain: 200, label: 'Papa' },
			{ id: 2, gain: 6.19, label: 'Bourse' },
			{ id: 3, gain: 953.96, label: 'Job' },
		],
		expenses: [
			{ id: 1, cost: 365, duty: true, label: 'Loyer' },
			{ id: 2, cost: 162, duty: false, label: 'Alimentation' },
			{ id: 3, cost: 100, duty: false, label: 'Loisirs' },
		],
	};
	return (
		<View style={styles.container}>
			<CashFlow
				x={Dimensions.get('window').width - 40}
				y={200}
				data={data}
			/>
			<Text>Open up Compta.tsx to start working on your compta!</Text>
			<StatusBar style="auto" />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#fff',
		alignItems: 'center',
		justifyContent: 'center',
	},
});
