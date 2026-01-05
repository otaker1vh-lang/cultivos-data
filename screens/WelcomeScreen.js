import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Dimensions,
  ActivityIndicator // Opcional: Para mostrar que está cargando
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // <--- Se agrega esta línea

// --- Paleta de Colores ---
const colors = {
  background: '#FDFBF7', 
  primaryGreen: '#4A7C59', 
  secondaryBrown: '#8C6239', 
  textDark: '#2C3E50', 
};

const { width } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }) => {

  useEffect(() => {
    // Configura el temporizador para cambiar de pantalla
    const timer = setTimeout(() => {
      // 'replace' borra el historial para que no puedan volver atrás a esta pantalla
      navigation.replace('Home'); 
    }, 3000); // 3000 milisegundos = 3 segundos

    // Limpieza del timer si el componente se desmonta antes
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.contentContainer}>
        
        {/* --- SECCIÓN DEL LOGO --- */}
        <View style={styles.logoContainer}>
          <Image
            // Asegúrate que la ruta sea correcta según tu estructura
            source={require('../assets/logo_roslin.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* --- SECCIÓN DE TEXTO --- */}
        <View style={styles.textContainer}>
          <Text style={styles.title}></Text>
          <Text style={styles.subtitle}>
            Conectando productores, cultivando el futuro.
          </Text>
          
          {/* Opcional: Un indicador de carga pequeño */}
          <View style={{ marginTop: 30 }}>
            <ActivityIndicator size="large" color={colors.primaryGreen} />
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center', // Centramos todo verticalmente
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  
  // --- Estilos del Logo ---
  logoContainer: {
    marginBottom: 40, // Separación entre logo y texto
    justifyContent: 'center',
    alignItems: 'center',
    // Eliminamos flex: 2 para que no empuje tanto, ahora es un diseño centrado estático
  },
  logo: {
    width: width * 0.6, // Un poco más pequeño para que se vea elegante
    height: width * 0.6, 
  },

  // --- Estilos de Texto ---
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.textDark,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: colors.secondaryBrown,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
  },
});

export default WelcomeScreen;