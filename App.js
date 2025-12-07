import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack'; 

// Importa todas las pantallas
// Asegúrate de mover tu archivo WelcomeScreen.js a la carpeta 'screens'
import WelcomeScreen from './screens/WelcomeScreen'; // <--- NUEVA IMPORTACIÓN
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

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Welcome" // <--- CAMBIO AQUÍ: Arranca con la Bienvenida
        screenOptions={{
          headerStyle: { backgroundColor: '#4CAF50' }, 
          headerTintColor: '#fff', 
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        {/* 0. Pantalla de Bienvenida (Nueva) */}
        <Stack.Screen 
            name="Welcome" 
            component={WelcomeScreen} 
            options={{ headerShown: false }} // Sin cabecera para que luzca el diseño
        />

        {/* 1. Pantalla Principal: Listado con Filtro */}
        <Stack.Screen 
            name="Home" 
            component={HomeScreen} 
            options={{ headerShown: false, title: 'Roślinapp 🌿' }} 
        />
        
        {/* 2. Pantalla Intermedia: Menú de Detalle por Cultivo */}
        <Stack.Screen 
            name="MenuDetalle" 
            component={MenuDetalleScreen} 
            options={({ route }) => ({ title: `Detalle: ${route.params?.cultivo || ''}` })} 
        />
        
        {/* 3. Pantallas de Funcionalidad */}
        <Stack.Screen 
            name="Estadisticas" 
            component={EstadisticasScreen} 
            options={({ route }) => ({ title: `Estadísticas de ${route.params?.cultivo || ''}` })} 
        />
        <Stack.Screen 
            name="Fenologia" 
            component={FenologiaScreen} 
            options={({ route }) => ({ title: `Ciclo Fenológico de ${route.params?.cultivo || ''}` })} 
        />
        <Stack.Screen 
            name="Labores" 
            component={LaboresScreen} 
            options={({ route }) => ({ title: `Labores de ${route.params?.cultivo || ''}` })} 
        />
        <Stack.Screen 
            name="Plagas" 
            component={PlagasScreen} 
            options={({ route }) => ({ title: `Plagas de ${route.params?.cultivo || ''}` })} 
        />
        <Stack.Screen 
            name="Calculo" 
            component={CalculoScreen} 
            options={({ route }) => ({ title: `Cálculo para ${route.params?.cultivo || ''}` })} 
        />
        <Stack.Screen 
            name="Bitacora" 
            component={BitacoraScreen}
            options={({ route }) => ({ title: `Bitácora de ${route.params?.cultivo || ''}` })}
        />
        <Stack.Screen 
            name="Recordatorios" 
            component={RecordatoriosScreen}
            options={({ route }) => ({ title: `Agenda: ${route.params?.cultivo || ''}` })}
        />
        
        <Stack.Screen 
            name="About" 
            component={AboutScreen} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}