import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack'; 

// Importación de pantallas (Verifica que las rutas sean correctas)
import WelcomeScreen from './screens/WelcomeScreen';
import HomeScreen from './screens/HomeScreen';
import MenuDetalleScreen from './screens/MenuDetalleScreen'; // Tu menú principal por cultivo
import EstadisticasScreen from './screens/EstadisticasScreen';
import FenologiaScreen from './screens/FenologiaScreen'; 
import LaboresScreen from './screens/LaboresScreen';
import PlagasScreen from './screens/PlagasScreen';
import CalculoScreen from './screens/CalculoScreen';
import BitacoraScreen from './screens/BitacoraScreen';
import AboutScreen from './screens/AboutScreen'; 

// Pantallas Globales solicitadas
import AgroControlScreen from './screens/AgroControlScreen'; 
import NoticiasScreen from './screens/NoticiasScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Welcome"
        screenOptions={{
          headerStyle: { backgroundColor: '#2E7D32' }, 
          headerTintColor: '#fff', 
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        {/* Flujo Principal */}
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />

        {/* IMPORTANTE: 
           En tu HomeScreen.js, debes cambiar:
           navigation.navigate('DetalleTabs', { cultivo: item.nombre })
           por:
           navigation.navigate('MenuDetalle', { cultivo: item.nombre })
        */}
        <Stack.Screen 
          name="MenuDetalle" 
          component={MenuDetalleScreen} 
          options={({ route }) => ({ title: route.params?.cultivo || 'Detalle' })} 
        />

        {/* Herramientas del Home */}
        <Stack.Screen name="AgroControl" component={AgroControlScreen} options={{ title: 'AgroControl' }} />
        <Stack.Screen name="Noticias" component={NoticiasScreen} options={{ title: 'Noticias' }} />
        <Stack.Screen name="About" component={AboutScreen} options={{ title: 'Acerca de' }} />
        <Stack.Screen name="Bitacora" component={BitacoraScreen} options={{ title: 'Mi Bitácora' }} />

        {/* Sub-pantallas de cada cultivo */}
        <Stack.Screen name="Estadisticas" component={EstadisticasScreen} />
        <Stack.Screen name="Fenologia" component={FenologiaScreen} />
        <Stack.Screen name="Labores" component={LaboresScreen} />
        <Stack.Screen name="Plagas" component={PlagasScreen} />
        <Stack.Screen name="Calculo" component={CalculoScreen} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}