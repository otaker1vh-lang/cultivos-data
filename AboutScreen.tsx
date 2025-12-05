import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const AboutScreen = () => {

  const openLink = (url) => {
    Linking.openURL(url).catch(err => console.error("Couldn't load page", err));
  };

  return (
    <ScrollView style={styles.container}>
      
      {/* CABECERA - LOGO Y VERSIÓN */}
      <View style={styles.header}>
        <View style={styles.logoPlaceholder}>
            {/* Reemplaza esto con tu componente <Image source={...} /> */}
            <Ionicons name="leaf" size={60} color="#2E7D32" />
        </View>
        <Text style={styles.appName}>Roslinapp</Text>
        <Text style={styles.version}>Versión 1.0.0 (Beta)</Text>
        <Text style={styles.tagline}>Tecnología al servicio del campo</Text>
      </View>

      {/* SECCIÓN DE AGRADECIMIENTOS IA */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🧠 Inteligencia Artificial</Text>
        <Text style={styles.text}>
          El modelo de detección de plagas de esta aplicación ha sido entrenado utilizando conjuntos de datos de acceso público con fines educativos y de investigación.
        </Text>
        
        <View style={styles.creditItem}>
          <Text style={styles.creditLabel}>Dataset Principal:</Text>
          <Text style={styles.creditValue}>New Plant Diseases Dataset (Kaggle)</Text>
        </View>
        
        <View style={styles.creditItem}>
          <Text style={styles.creditLabel}>Licencia:</Text>
          <Text style={styles.creditValue}>CC BY-NC 4.0 (Uso No Comercial)</Text>
        </View>

        <TouchableOpacity onPress={() => openLink('https://creativecommons.org/licenses/by-nc/4.0/')}>
          <Text style={styles.link}>Ver Licencia Completa</Text>
        </TouchableOpacity>
      </View>

      {/* SECCIÓN DE DESCARGO DE RESPONSABILIDAD (CRÍTICO) */}
      <View style={[styles.section, styles.warningSection]}>
        <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
            <Ionicons name="warning" size={24} color="#D32F2F" />
            <Text style={[styles.sectionTitle, {color: '#D32F2F', marginBottom: 0, marginLeft: 10}]}>
              Aviso Importante
            </Text>
        </View>
        <Text style={styles.disclaimerText}>
          Roslinapp es una herramienta de asistencia y **NO sustituye el criterio de un ingeniero agrónomo profesional**. 
        </Text>
        <Text style={styles.disclaimerText}>
          La detección por IA puede tener márgenes de error. El desarrollador no se hace responsable por decisiones tomadas basadas únicamente en esta aplicación, ni por pérdidas de cultivos derivadas de diagnósticos automáticos.
        </Text>
      </View>

      {/* CRÉDITOS DEL DESARROLLADOR */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👨‍💻 Desarrollo</Text>
        <Text style={styles.text}>
          Aplicación desarrollada con React Native y TensorFlow Lite.
        </Text>
        <Text style={styles.footerText}>© 2025 Roslinapp. Todos los derechos reservados.</Text>
      </View>

      <View style={{height: 40}} /> 
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 20,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: '#E8F5E9',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  version: {
    fontSize: 14,
    color: '#757575',
    marginTop: 5,
  },
  tagline: {
    fontSize: 16,
    color: '#388E3C',
    marginTop: 5,
    fontStyle: 'italic',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 20,
    borderRadius: 12,
    elevation: 2, // Sombra en Android
    shadowColor: '#000', // Sombra en iOS
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  warningSection: {
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
    backgroundColor: '#FFEBEE',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  text: {
    fontSize: 15,
    color: '#424242',
    lineHeight: 22,
    marginBottom: 10,
  },
  creditItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingBottom: 4,
  },
  creditLabel: {
    fontWeight: '600',
    color: '#555',
  },
  creditValue: {
    color: '#333',
    maxWidth: '60%',
    textAlign: 'right',
  },
  link: {
    color: '#1976D2',
    fontWeight: 'bold',
    marginTop: 10,
  },
  disclaimerText: {
    fontSize: 14,
    color: '#B71C1C',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  footerText: {
    textAlign: 'center',
    color: '#9E9E9E',
    fontSize: 12,
    marginTop: 10,
  }
});

export default AboutScreen;