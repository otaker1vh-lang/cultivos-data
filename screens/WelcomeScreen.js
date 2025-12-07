import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
} from 'react-native';

// --- Paleta de Colores de RóslinApp ---
const colors = {
  background: '#FDFBF7', // Un tono crema/papel suave
  primaryGreen: '#4A7C59', // Verde oscuro de las hojas
  secondaryBrown: '#8C6239', // Marrón tierra del granero y raíces
  textDark: '#2C3E50', // Color oscuro para títulos
  textLight: '#FFFFFF', // Para texto sobre botones oscuros
};

const { width } = Dimensions.get('window');

const WelcomeScreen = () => {
  // Funciones placeholder para los botones
  const handleLoginPress = () => {
    console.log('Navegar a Iniciar Sesión');
    // Aquí iría tu navegación, ej: navigation.navigate('Login');
  };

  const handleSignUpPress = () => {
    console.log('Navegar a Registro');
    // Aquí iría tu navegación, ej: navigation.navigate('SignUp');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.contentContainer}>
        
        {/* --- SECCIÓN DEL LOGO --- */}
        <View style={styles.logoContainer}>
          {/* IMPORTANTE: Asegúrate de que la ruta 'require' sea correcta 
             dependiendo de dónde guardaste tu archivo WelcomeScreen.js.
             Si este archivo está en /src/screens/, la ruta sería:
             require('../../assets/logo_roslin.png')
          */}
          <Image
            source={require('./assets/logo_roslin.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* --- SECCIÓN DE TEXTO --- */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>RóslinApp</Text>
          <Text style={styles.subtitle}>
            Conectando productores, cultivando el futuro.
          </Text>
        </View>

        {/* --- SECCIÓN DE BOTONES --- */}
        <View style={styles.buttonContainer}>
          {/* Botón Principal (Iniciar Sesión) */}
          <TouchableOpacity style={styles.buttonPrimary} onPress={handleLoginPress}>
            <Text style={styles.buttonTextPrimary}>Iniciar Sesión</Text>
          </TouchableOpacity>

          {/* Botón Secundario (Registrarse) */}
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleSignUpPress}>
            <Text style={styles.buttonTextSecondary}>Crear Cuenta</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Contenedor principal que cubre toda la pantalla
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Contenedor para centrar el contenido vertical y horizontalmente
  contentContainer: {
    flex: 1,
    justifyContent: 'space-evenly', // Distribuye el espacio entre logo, texto y botones
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 20,
  },
  
  // --- Estilos del Logo ---
  logoContainer: {
    flex: 2, // Toma más espacio en la parte superior
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  logo: {
    width: width * 0.7, // El logo ocupará el 70% del ancho de la pantalla
    height: width * 0.7, // Mantenemos la relación de aspecto cuadrada
    // Si quieres un efecto de sombra suave debajo del logo (opcional):
    // shadowColor: colors.secondaryBrown,
    // shadowOffset: { width: 0, height: 10 },
    // shadowOpacity: 0.2,
    // shadowRadius: 10,
  },

  // --- Estilos de Texto ---
  textContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.textDark,
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: Platform.OS === 'android' ? 'sans-serif-medium' : 'Avenir-Heavy', // Sugerencia de fuentes limpias
  },
  subtitle: {
    fontSize: 18,
    color: colors.secondaryBrown,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },

  // --- Estilos de Botones ---
  buttonContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    gap: 15, // Espacio entre botones (funciona en versiones recientes de RN)
    marginBottom: 20,
  },
  buttonPrimary: {
    backgroundColor: colors.primaryGreen,
    paddingVertical: 16,
    borderRadius: 30, // Bordes muy redondeados para un look orgánico
    alignItems: 'center',
    shadowColor: colors.primaryGreen, // Sombra verde suave
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5, // Sombra para Android
  },
  buttonTextPrimary: {
    color: colors.textLight,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.secondaryBrown,
  },
  buttonTextSecondary: {
    color: colors.secondaryBrown,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
  },
});

export default WelcomeScreen;