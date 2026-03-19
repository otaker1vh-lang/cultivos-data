import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  Alert,
  RefreshControl 
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import CultivoDataManager from "../utils/CultivoDataManager";

export default function LaboresScreen({ route }) {
  const { cultivo } = route.params;
  const CACHE_KEY = `@labores_data_${cultivo}`; 
  
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); 
  const [loadingCompleto, setLoadingCompleto] = useState(false);
  const [nivel, setNivel] = useState('basico');
  const [debugInfo, setDebugInfo] = useState([]); 
  
  const [etapaExpandida, setEtapaExpandida] = useState(null);
  const [calendarioRiegoExpanded, setCalendarioRiegoExpanded] = useState(false);
  const [infraestructuraExpanded, setInfraestructuraExpanded] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  const cargarDatos = async (forceRefresh = false) => {
    try {
      setLoading(true);
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo', forceRefresh);
      
      if (data) {
        setCultivoData(data);
        setNivel(data._nivel || 'basico');
      }
    } catch (error) {
      console.error("Error cargando labores:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const cargarDatosCompletos = async () => {
    try {
      setLoadingCompleto(true);
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo', true);
      if (data && data._nivel === 'completo') {
        setCultivoData(data);
        setNivel('completo');
        Alert.alert("Éxito", "Datos técnicos actualizados desde la nube.");
      }
    } catch (error) {
      Alert.alert("Error", "No se pudieron obtener los datos detallados.");
    } finally {
      setLoadingCompleto(false);
    }
  };

  // --- HELPER UNIVERSAL PARA TEXTO SEGURO ---
  const safeText = (val) => {
    if (val === null || val === undefined) return 'N/A';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') return Object.values(val).map(v => typeof v === 'object' ? 'Detalle anidado' : String(v)).join(', ');
    return String(val);
  };

  // --- SECCIONES DE RENDERIZADO BLINDADAS ---

  const renderRiego = () => {
    const planRiegoRaw = cultivoData?.calendario_riego_mensual;
    const planRiego = planRiegoRaw?.calendario_riego || planRiegoRaw;
    const sistemasRiego = cultivoData?.sistemas_riego;

    if (!planRiego && (!sistemasRiego || sistemasRiego.length === 0)) return null;

    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="water" size={24} color="#1976D2" />
          <Text style={styles.sectionTitle}>Gestión Hídrica</Text>
        </View>

        {sistemasRiego && Array.isArray(sistemasRiego) && sistemasRiego.length > 0 && (
          <View style={styles.subSection}>
            <Text style={styles.subTitle}>Sistemas Recomendados</Text>
            {sistemasRiego.map((sistema, idx) => (
              <View key={idx} style={styles.itemDetalle}>
                <Text style={styles.itemLabel}>{safeText(sistema?.sistema || 'Sistema no especificado')}</Text>
                <Text style={styles.itemValue}>Eficiencia: {safeText(sistema?.eficiencia_pct || 0)}%</Text>
                <Text style={styles.itemNote}>Lámina: {safeText(sistema?.lamina_anual_mm || 0)} mm/año</Text>
              </View>
            ))}
          </View>
        )}

        {planRiego && typeof planRiego === 'object' && (
          <TouchableOpacity 
            style={styles.expandButton}
            onPress={() => setCalendarioRiegoExpanded(!calendarioRiegoExpanded)}
          >
            <Text style={styles.expandButtonText}>Ver Calendario Mensual</Text>
            <Ionicons name={calendarioRiegoExpanded ? "chevron-up" : "chevron-down"} size={20} color="#1976D2" />
          </TouchableOpacity>
        )}

        {calendarioRiegoExpanded && planRiego && typeof planRiego === 'object' && (
          <View style={styles.expandedContent}>
            {Object.entries(planRiego).map(([mes, info]) => {
              if (!info || typeof info !== 'object') return null;
              return (
                <View key={mes} style={styles.mesRiegoRow}>
                  <Text style={styles.mesText}>{mes}</Text>
                  <View style={styles.mesData}>
                    <Text style={styles.mesValue}>{safeText(info.riegos_mes || 0)} riegos</Text>
                    <Text style={styles.mesSubValue}>{safeText(info.lamina_mm_mes || 0)} mm totales</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderFertilizacion = () => {
    const fertPrograma = cultivoData?.programa_fertilizacion || cultivoData?.calculo_fertilizacion;

    if (!fertPrograma) return null;

    // Helper interno para analizar inteligentemente cualquier formato de fertilizante
    const extraerDatosFertilizante = (datos) => {
      if (!datos || typeof datos !== 'object') return { formula: 'N/A', dosis: String(datos || 'N/A') };
      
      // Si viene en el formato estándar esperado
      if (datos.formula || datos.dosis_kg_ha || datos.dosis) {
        return {
          formula: safeText(datos.formula || 'Dosis técnica'),
          dosis: safeText(datos.dosis_kg_ha || datos.dosis || 'N/A') + (datos.dosis_kg_ha ? ' Kg/Ha' : '')
        };
      }

      // Si viene como un desglose de macro/micronutrientes (ej. {N: 120, P: 60})
      const componentes = Object.entries(datos)
        .filter(([key, val]) => typeof val === 'number' || typeof val === 'string')
        .map(([key, val]) => `${key}: ${val}`);

      if (componentes.length > 0) {
        return {
          formula: 'Desglose Nutricional',
          dosis: componentes.join(', ')
        };
      }

      return { formula: 'Ver detalles', dosis: 'Manejo complejo' };
    };

    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="flask-outline" size={24} color="#689F38" />
          <Text style={styles.sectionTitle}>Plan de Nutrición</Text>
        </View>

        {typeof fertPrograma === 'object' && !Array.isArray(fertPrograma) ? (
          Object.entries(fertPrograma).map(([etapa, datos], idx) => {
            if (!datos) return null; 
            const infoGarantizada = extraerDatosFertilizante(datos);
            return (
              <View key={idx} style={styles.fertilizanteItem}>
                <Text style={styles.etapaFertText}>{etapa}</Text>
                <Text style={styles.formulaText}>{infoGarantizada.formula}</Text>
                <Text style={styles.dosisText}>{infoGarantizada.dosis}</Text>
              </View>
            );
          })
        ) : Array.isArray(fertPrograma) ? (
          fertPrograma.map((item, idx) => {
            const infoGarantizada = extraerDatosFertilizante(item);
            return (
              <View key={idx} style={styles.fertilizanteItem}>
                <Text style={styles.etapaFertText}>{safeText(item?.etapa || `Fase ${idx+1}`)}</Text>
                <Text style={styles.formulaText}>{infoGarantizada.formula}</Text>
                <Text style={styles.dosisText}>{infoGarantizada.dosis}</Text>
              </View>
            );
          })
        ) : null}
      </View>
    );
  };

  const renderLabores = () => {
    const laboresRaw = cultivoData?.labores_culturales || cultivoData?.labores;
    if (!laboresRaw) return null;

    const seccionesLabores = typeof laboresRaw === 'object' && !Array.isArray(laboresRaw) 
      ? Object.entries(laboresRaw) 
      : [['General', laboresRaw]];

    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="shovel" size={24} color="#795548" />
          <Text style={styles.sectionTitle}>Labores Culturales</Text>
        </View>

        {seccionesLabores.map(([tituloEtapa, contenido], idx) => {
          let cantidad = 0;
          if (Array.isArray(contenido)) cantidad = contenido.length;
          else if (typeof contenido === 'object' && contenido !== null) cantidad = Object.keys(contenido).length;
          else if (contenido) cantidad = 1;

          if (cantidad === 0) return null; 

          return (
            <View key={idx} style={styles.etapaContainer}>
              <TouchableOpacity 
                style={[styles.etapaCard, etapaExpandida === tituloEtapa && styles.etapaCardActive]}
                onPress={() => setEtapaExpandida(etapaExpandida === tituloEtapa ? null : tituloEtapa)}
              >
                <View style={styles.etapaHeader}>
                  <View style={styles.etapaHeaderLeft}>
                    <Text style={styles.etapaTitle}>{tituloEtapa}</Text>
                    <Text style={styles.etapaCount}>{cantidad} {cantidad === 1 ? 'actividad' : 'actividades'}</Text>
                  </View>
                  <Ionicons 
                    name={etapaExpandida === tituloEtapa ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color="#666" 
                  />
                </View>
              </TouchableOpacity>

              {etapaExpandida === tituloEtapa && (
                <View style={styles.actividadesContainer}>
                  {Array.isArray(contenido) ? (
                    contenido.map((act, i) => (
                      <View key={i} style={styles.actividadItem}>
                        <Text style={styles.actTitle}>
                          {typeof act === 'string' 
                            ? act 
                            : safeText(act?.actividad || act?.nombre || 'Actividad')}
                        </Text>
                        {act?.descripcion && <Text style={styles.actDesc}>{safeText(act.descripcion)}</Text>}
                      </View>
                    ))
                  ) : typeof contenido === 'object' && contenido !== null ? (
                    Object.entries(contenido).map(([key, val], i) => (
                      <View key={i} style={styles.actividadItem}>
                        <Text style={styles.actTitle}>{key}</Text>
                        <Text style={styles.actDesc}>
                          {typeof val === 'string' ? val : safeText(val?.descripcion || val)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.actividadItem}>
                      <Text style={styles.actTitle}>Detalle</Text>
                      <Text style={styles.actDesc}>{String(contenido)}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderPostcosecha = () => {
    const pc = cultivoData?.postcosecha;
    if (!pc || typeof pc !== 'object') return null;

    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="package-variant" size={24} color="#FB8C00" />
          <Text style={styles.sectionTitle}>Manejo Postcosecha</Text>
        </View>
        <View style={styles.postContent}>
          <View style={styles.postItem}>
            <Text style={styles.postLabel}>Punto de Cosecha:</Text>
            <Text style={styles.postValue}>{safeText(pc.punto_cosecha || 'Consultar guía')}</Text>
          </View>
          <View style={styles.postItem}>
            <Text style={styles.postLabel}>Temperatura:</Text>
            <Text style={styles.postValue}>{safeText(pc.temperatura_almacen || 'N/A')}</Text>
          </View>
          <View style={styles.postItem}>
            <Text style={styles.postLabel}>Vida Útil:</Text>
            <Text style={styles.postValue}>
              {pc.vida_util_dias ? `${safeText(pc.vida_util_dias)} días` : 'N/A'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.loadingText}>Cargando plan maestro...</Text>
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
      <View style={styles.header}>
        <Text style={styles.title}>Plan de Manejo</Text>
        <Text style={styles.subtitle}>{cultivo}</Text>
      </View>

      {nivel === 'basico' && (
        <TouchableOpacity style={styles.upgradeCard} onPress={cargarDatosCompletos} disabled={loadingCompleto}>
          {loadingCompleto ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="cloud-download" size={24} color="#fff" />
              <View style={styles.upgradeTextContainer}>
                <Text style={styles.upgradeTitle}>Desbloquear Datos Técnicos</Text>
                <Text style={styles.upgradeSubtitle}>Riego, fertilización y costos detallados</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      )}

      {renderLabores()}
      {renderRiego()}
      {renderFertilizacion()}
      {renderPostcosecha()}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  header: { padding: 20, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E0E0E0" },
  title: { fontSize: 24, fontWeight: "bold", color: "#1B5E20" },
  subtitle: { fontSize: 16, color: "#666", marginTop: 4 },
  loadingText: { marginTop: 10, color: "#666" },
  
  sectionCard: { backgroundColor: "#fff", marginHorizontal: 15, marginTop: 15, borderRadius: 12, padding: 15, elevation: 2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 15, borderBottomWidth: 1, borderBottomColor: "#F0F0F0", paddingBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", marginLeft: 10, color: "#333" },
  
  subSection: { marginTop: 10 },
  subTitle: { fontSize: 14, fontWeight: "bold", color: "#666", marginBottom: 10 },
  itemDetalle: { backgroundColor: "#F9F9F9", padding: 10, borderRadius: 8, marginBottom: 8 },
  itemLabel: { fontWeight: "bold", color: "#333" },
  itemValue: { color: "#1976D2", fontSize: 13 },
  itemNote: { color: "#666", fontSize: 12, fontStyle: "italic" },

  upgradeCard: { flexDirection: "row", backgroundColor: "#2E7D32", margin: 15, padding: 15, borderRadius: 12, alignItems: "center", elevation: 4 },
  upgradeTextContainer: { marginLeft: 15 },
  upgradeTitle: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  upgradeSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 12 },

  etapaContainer: { marginBottom: 10 },
  etapaCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 5, elevation: 1, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E0E0' },
  etapaCardActive: { borderColor: '#2E7D32', borderWidth: 2 },
  etapaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
  etapaHeaderLeft: { flex: 1 },
  etapaTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  etapaCount: { fontSize: 11, color: '#666' },
  actividadesContainer: { padding: 15, backgroundColor: '#FAFAFA', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  actividadItem: { marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#81C784', paddingLeft: 10 },
  actTitle: { fontSize: 14, fontWeight: 'bold', color: '#2E7D32' },
  actDesc: { fontSize: 13, color: '#555', marginTop: 2 },

  fertilizanteItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  etapaFertText: { fontSize: 14, fontWeight: "bold", color: "#333" },
  formulaText: { fontSize: 13, color: "#689F38", marginTop: 2 },
  dosisText: { fontSize: 12, color: "#666" },

  expandButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 10, marginTop: 10 },
  expandButtonText: { color: '#1976D2', fontWeight: 'bold', marginRight: 5 },
  expandedContent: { marginTop: 10, backgroundColor: '#F0F7FF', borderRadius: 8, padding: 10 },
  mesRiegoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#D1E3F8' },
  mesText: { fontWeight: 'bold', color: '#333' },
  mesData: { alignItems: 'flex-end' },
  mesValue: { fontSize: 13, color: '#1976D2' },
  mesSubValue: { fontSize: 11, color: '#666' },

  postContent: { marginTop: 5 },
  postItem: { marginBottom: 8 },
  postLabel: { fontSize: 13, fontWeight: "bold", color: "#666" },
  postValue: { fontSize: 14, color: "#333" }
});