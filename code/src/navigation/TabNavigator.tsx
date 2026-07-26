import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import HomeScreen from "../screens/HomeScreen";

const Tab = createBottomTabNavigator();

const tabs = [
	{ name: 'Accueil', screen: HomeScreen }
]

export default function TabNavigator() {
	return (
		<Tab.Navigator screenOptions={{ headerShown: false }}>
			{tabs.map((tab) => (
				<Tab.Screen key={tab.name} name={tab.name} component={tab.screen} />
			))}
		</Tab.Navigator>
	)
}
