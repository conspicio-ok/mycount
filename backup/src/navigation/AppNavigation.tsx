import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import Compta from '@/screens/Compta';
import Invest from '@/screens/Invest';
import Suivi from '@/screens/Suivi';
import Projection from '@/screens/Projection';
import Settings from '@/screens/Settings';

const Tab = createBottomTabNavigator();

function Navigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: 'gray',
          tabBarStyle: {
            paddingBottom: 5,
            height: 60,
          },
        }}
      >
        <Tab.Screen 
          name="Compta" 
          component={Compta}
          options={{
            tabBarLabel: 'Compta',
          }}
        />
        
        <Tab.Screen 
          name="Invest" 
          component={Invest}
          options={{
            tabBarLabel: 'Recherche',
          }}
        />
        
        <Tab.Screen 
          name="Suivi" 
          component={Suivi}
          options={{
            tabBarLabel: 'Ajouter',
          }}
        />
        
        <Tab.Screen 
          name="Projection" 
          component={Projection}
          options={{
            tabBarLabel: 'Notifications',
          }}
        />
        
        <Tab.Screen 
          name="Settings" 
          component={Settings}
          options={{
            tabBarLabel: 'Profil',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default Navigation;