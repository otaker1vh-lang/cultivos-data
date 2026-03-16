import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator, 
  Image, 
  TouchableOpacity, 
  Linking,
  RefreshControl 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CultivoDataManager from '../utils/CultivoDataManager';

export default function GuiaScreen({ route }) {
  const { cultivo } = route.params || {};

  // --- ESTADOS ORIGINALES PRESERVADOS ---
  const [infoCultivo, setInfoCultivo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nivel, setNivel] = useState('basico');

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  // --- FUNCIÓN ORIGINAL CON LÓGICA DE FALLBACK PRESERVADA ---
  const cargarDatos = async (isRefreshing = false) => {
    if (cultivo) {
      if (!isRefreshing) setLoading(true);
      try {
        const completos = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
        if (completos && completos._nivel === 'completo') {
          setInfoCultivo(completos);
          setNivel('completo');
        } else {
          const basicos = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
          setInfoCultivo(basicos);
          setNivel('basico');
        }
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // --- COMPONENTE DE ERROR (RESTAURADO DEL ORIGINAL) ---
  const ErrorCard = ({ title, message, solution }) => (
    <View style={styles.errorFullCard}>
      <View style={styles.errorHeader}>
        <MaterialCommunityIcons name="alert-circle" size={20} color="#C62828" />
        <Text style={styles.errorTitle}>{title}</Text>
      </View>
      <View style={styles.errorSection}>
        <Text style={styles.errorLabel}>DETALLE:</Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
      {solution && (
        <View style={styles.solutionSection}>
          <Text style={[styles.errorLabel, {color: '#2E7D32'}]}>SOLUCIÓN:</Text>
          <Text style={styles.errorText}>{solution}</Text>
        </View>
      )}
    </View>
  );

  // --- SECCIONES DE RENDERIZADO CON RUTAS MASTER V4 ---

  const renderHeader = () => (
    <View style={styles.header}>
      {infoCultivo?.imagen_url && (
        <Image source={{ uri: infoCultivo.imagen_url }} style={styles.headerImage} />
      )}
      <View style={styles.headerOverlay}>
        {/* CORRECCIÓN: infoCultivo.cultivo para Master */}
        <Text style={styles.title}>{infoCultivo?.cultivo || infoCultivo?.nombre || cultivo}</Text>
        <Text style={styles.category}>{infoCultivo?.categoria?.toUpperCase()}</Text>
      </View>
    </View>
  );

  const renderRequerimientos = () => {
    // CORRECCIÓN: requerimientos_agroclimaticos para Master
    const req = infoCultivo?.requerimientos_agroclimaticos || infoCultivo?.requerimientos;
    if (!req) return <ErrorCard title="Clima" message="No se encontraron requerimientos climáticos en Firebase." solution="Verifica que la clave 'requerimientos_agroclimaticos' exista." />;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Condiciones Óptimas</Text>
        <View style={styles.grid}>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="thermometer" size={24} color="#E64A19" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Clima/Temp</Text>
              <Text style={styles.infoValue}>{req.clima_optimo || req.temperatura || 'N/A'}</Text>
            </View>
          </View>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="elevation-rise" size={24} color="#1976D2" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Altitud</Text>
              <Text style={styles.infoValue}>{req.altitud || 'N/A'}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderPlagas = () => {
    // CORRECCIÓN: sanidad.principales_plagas_enfermedades para Master
    const plagas = infoCultivo?.sanidad?.principales_plagas_enfermedades || infoCultivo?.plagas_y_enfermedades;
    if (!plagas) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sanidad Vegetal</Text>
        {Object.values(plagas).map((plaga, index) => (
          <View key={index} style={styles.plagaItem}>
            <View style={styles.plagaHeader}>
              <MaterialCommunityIcons name="bug" size={20} color="#C62828" />
              <Text style={styles.plagaName}>{plaga.nombre || plaga}</Text>
            </View>
            <Text style={styles.plagaDesc}>{plaga.descripcion || 'Sin descripción detallada.'}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderAnalisisSuelo = () => {
    const suelo = infoCultivo?.analisis_suelo_recomendado;
    if (!suelo) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suelo Recomendado</Text>
        <View style={styles.sueloCard}>
          <Text style={styles.practicaText}>• pH: {suelo.ph_optimo}</Text>
          <Text style={styles.practicaText}>• Textura: {suelo.textura_ideal}</Text>
          <Text style={styles.practicaText}>• M.O.: {suelo.materia_organica}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.loadingText}>Sincronizando con Firebase...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => cargarDatos(true)} />
      }
    >
      {renderHeader()}

      <View style={styles.content}>
        {nivel === 'basico' && (
          <View style={styles.basicoAlert}>
            <MaterialCommunityIcons name="information" size={20} color="#0288D1" />
            <Text style={styles.basicoAlertText}>
              Modo Offline: Datos técnicos limitados.
            </Text>
          </View>
        )}

        {renderRequerimientos()}
        {renderAnalisisSuelo()}
        {renderPlagas()}

        {infoCultivo?.panorama_url && (
          <TouchableOpacity 
            style={styles.linkButton} 
            onPress={() => Linking.openURL(infoCultivo.panorama_url)}
          >
            <MaterialCommunityIcons name="file-pdf-box" size={24} color="#fff" />
            <Text style={styles.linkButtonText}>Panorama Agroalimentario</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// --- ESTILOS ORIGINALES PRESERVADOS (INCLUYENDO ERRORES Y RIESGOS) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666' },
  header: { height: 200, backgroundColor: '#2E7D32' },
  headerImage: { width: '100%', height: '100%', opacity: 0.6 },
  headerOverlay: { position: 'absolute', bottom: 20, left: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  category: { fontSize: 14, color: '#E8F5E9', fontWeight: 'bold' },
  content: { padding: 15 },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#2E7D32', paddingLeft: 10 },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  infoCard: { width: '48%', backgroundColor: '#fff', padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  infoContent: { marginLeft: 10 },
  infoLabel: { fontSize: 10, color: '#888', textTransform: 'uppercase' },
  infoValue: { fontSize: 13, fontWeight: 'bold' },
  plagaItem: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 1 },
  plagaHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  plagaName: { fontSize: 15, fontWeight: 'bold', marginLeft: 8, color: '#C62828' },
  plagaDesc: { fontSize: 13, color: '#666' },
  sueloCard: { backgroundColor: '#EFEBE9', padding: 15, borderRadius: 10 },
  practicaText: { fontSize: 14, color: '#333', marginBottom: 5 },
  basicoAlert: { flexDirection: 'row', backgroundColor: '#E1F5FE', padding: 12, borderRadius: 8, marginBottom: 20, alignItems: 'center' },
  basicoAlertText: { marginLeft: 10, fontSize: 12, color: '#01579B' },
  linkButton: { backgroundColor: '#D32F2F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 12, marginTop: 10 },
  linkButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
  // ESTILOS DE ERROR PRESERVADOS
  errorFullCard: { backgroundColor: '#FFEBEE', borderRadius: 12, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: '#FFCDD2' },
  errorHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  errorTitle: { fontSize: 15, fontWeight: 'bold', color: '#C62828', marginLeft: 8 },
  errorSection: { marginTop: 6 },
  errorLabel: { fontSize: 11, fontWeight: 'bold', color: '#D32F2F' },
  errorText: { fontSize: 13, color: '#444' },
  solutionSection: { marginTop: 8, backgroundColor: '#E8F5E9', padding: 8, borderRadius: 6 }
});