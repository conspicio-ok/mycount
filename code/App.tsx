import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { initDb } from './src/db/init';
import { useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { NavigationContainer } from '@react-navigation/native';
import TabNavigator from './src/navigation/TabNavigator';
import { DbProvider } from './src/db/DbContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
	const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
	const [status, setStatus] = useState('loading');

	useEffect(() => {
		async function load() {
			try {
				const db = await initDb();
				setStatus('ready')
				setDb(db);
			} catch (e) {
				setStatus('error')
				console.log(e)
			}
		}
		load();
	}, [])

	if (status !== 'ready' || !db) {
		return (
			<GestureHandlerRootView style={styles.container}>
				<Text>{status === 'error' ? 'Erreur DB' : 'Chargement...'}</Text>
			</GestureHandlerRootView>
		);
	}

	return (
		<GestureHandlerRootView style={styles.container}>
			<DbProvider db={db}>
				<NavigationContainer>
					<TabNavigator />
				</NavigationContainer>
			</DbProvider>
		</GestureHandlerRootView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
});
