import CashFlow from '@/components/CashFlow';
import { StatusBar } from 'expo-status-bar';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

export default function Compta() {
  return (
    <View style={styles.container}>
      <CashFlow x = { Dimensions.get('window').width - 40 } y = { 200 }/>
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
