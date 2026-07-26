import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import HomeScreen from "../screens/HomeScreen";
import InvestScreen from "../screens/InvestScreen";
import SuiviScreen from "../screens/SuiviScreen";
import ProjectionScreen from "../screens/ProjectionScreen";

const Tab = createBottomTabNavigator();

const tabs = [
	{ name: 'Accueil', screen: HomeScreen },
	{ name: 'Investir', screen: InvestScreen },
	{ name: 'Suivi', screen: SuiviScreen },
	{ name: 'Projection', screen: ProjectionScreen },
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
