import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack'; 

import WelcomeScreen from './screens/WelcomeScreen';
import HomeScreen from './screens/HomeScreen';
import MenuDetalleScreen from './screens/MenuDetalleScreen';
import EstadisticasScreen from './screens/EstadisticasScreen';
import FenologiaScreen from './screens/FenologiaScreen'; 
import LaboresScreen from './screens/LaboresScreen';
import PlagasScreen from './screens/PlagasScreen';
import CalculoScreen from './screens/CalculoScreen';
import BitacoraScreen from './screens/BitacoraScreen';
import RecordatoriosScreen from './screens/RecordatoriosScreen';
import AboutScreen from './screens/AboutScreen'; 

// --- CORRECCIÓN IMPORTACIONES ---
import AgroControlScreen from './screens/AgroControlScreen'; 
import NoticiasScreen from './screens/NoticiasScreen'; // <--- FALTABA ESTO
// --------------------------------

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Welcome"
        screenOptions={{
          headerStyle: { backgroundColor: '#4CAF50' }, 
          headerTintColor: '#fff', 
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false, title: 'Roślinapp 🌿' }} />
        <Stack.Screen name="MenuDetalle" component={MenuDetalleScreen} options={({ route }) => ({ title: `Detalle: ${route.params?.cultivo || ''}` })} />
        <Stack.Screen name="Estadisticas" component={EstadisticasScreen} options={({ route }) => ({ title: `Estadísticas de ${route.params?.cultivo || ''}` })} />
        <Stack.Screen name="Fenologia" component={FenologiaScreen} options={({ route }) => ({ title: `Ciclo Fenológico de ${route.params?.cultivo || ''}` })} />
        <Stack.Screen name="Labores" component={LaboresScreen} options={({ route }) => ({ title: `Labores de ${route.params?.cultivo || ''}` })} />
        <Stack.Screen name="Plagas" component={PlagasScreen} options={({ route }) => ({ title: `Plagas de ${route.params?.cultivo || ''}` })} />
        <Stack.Screen name="Calculo" component={CalculoScreen} options={({ route }) => ({ title: `Cálculo para ${route.params?.cultivo || ''}` })} />
        <Stack.Screen name="Bitacora" component={BitacoraScreen} options={({ route }) => ({ title: `Bitácora de ${route.params?.cultivo || ''}` })} />
        <Stack.Screen name="Recordatorios" component={RecordatoriosScreen} options={({ route }) => ({ title: `Agenda: ${route.params?.cultivo || ''}` })} />
        
        {/* --- PANTALLAS NUEVAS --- */}
        <Stack.Screen name="AgroControl" component={AgroControlScreen} options={{ title: 'Control de Cultivos' }} />
        <Stack.Screen name="Noticias" component={NoticiasScreen} options={{ title: 'Noticias del Agro' }} />
        
        <Stack.Screen name="About" component={AboutScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}