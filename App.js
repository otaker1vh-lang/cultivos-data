import React from 'react';
import { LogBox } from 'react-native'; // Importamos LogBox para ocultar el warning molesto
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
import GuiaScreen from './screens/GuiaScreen';
import RecordatoriosScreen from './screens/RecordatoriosScreen';
// Pantallas Globales solicitadas
import AgroControlScreen from './screens/AgroControlScreen'; 
import NoticiasScreen from './screens/NoticiasScreen';
import ResumenCultivo from './src/components/ResumenCultivo';
import ReporteAvanzadoScreen from './screens/ReporteAvanzadoScreen'; // Ajusta la ruta si lo pusiste en src

// --- NUEVAS PANTALLAS ---
import FertilizantesScreen from './screens/FertilizantesScreen';
import DosisScreen from './screens/DosisScreen';
import WeatherScreen from './screens/WeatherScreen'; // <--- NUEVA IMPORTACIÓN

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
           En tu HomeScreen.js, asegúrate de navegar usando:
           navigation.navigate('MenuDetalle', { cultivo: item.nombre })
        */}
        <Stack.Screen 
          name="MenuDetalle" 
          component={MenuDetalleScreen} 
          options={({ route }) => ({ title: route.params?.cultivo || 'Detalle' })} 
        />

        {/* Herramientas del Home */}
        <Stack.Screen name="AgroControl" component={AgroControlScreen} options={{ title: 'AgroControl' }} />
        
        {/* Nuevas Herramientas */}
        <Stack.Screen name="Fertilizantes" component={FertilizantesScreen} options={{ title: 'Fertilizantes' }} />
        <Stack.Screen name="Dosis" component={DosisScreen} options={{ title: 'Calculadora Dosis' }} />

        <Stack.Screen name="Noticias" component={NoticiasScreen} options={{ title: 'Noticias' }} />
        <Stack.Screen name="About" component={AboutScreen} options={{ title: 'Acerca de' }} />
        <Stack.Screen name="Bitacora" component={BitacoraScreen} options={{ title: 'Mi Bitácora' }} />
        
        {/* PANTALLA DE CLIMA DETALLADO (NUEVA) */}
        <Stack.Screen name="Weather" component={WeatherScreen} options={{ title: 'Pronóstico Detallado' }} />

        {/* Sub-pantallas de cada cultivo */}
        <Stack.Screen name="Estadisticas" component={EstadisticasScreen} />
        <Stack.Screen name="Fenologia" component={FenologiaScreen} />
        <Stack.Screen name="Labores" component={LaboresScreen} />
        <Stack.Screen name="Plagas" component={PlagasScreen} />
        <Stack.Screen name="Calculo" component={CalculoScreen} />
        <Stack.Screen name="Recordatorios" component={RecordatoriosScreen} />
        <Stack.Screen 
          name="Guia" 
          component={GuiaScreen} 
          options={{ title: 'Guía Regional' }} 
        />
        <Stack.Screen 
          name="ReporteAvanzado" 
          component={ReporteAvanzadoScreen} 
          options={{ title: 'Exportar Reporte' }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}