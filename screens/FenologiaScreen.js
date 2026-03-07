import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  Alert 
} from "react-native";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GanttFenologico from '../components/GanttFenologico';

// --- IMPORTACIONES FIREBASE ---
import { getDatabase, ref, get, child } from 'firebase/database';
import { app } from '../utils/firebase';

export default function FenologiaScreen({ route }) {
  const { cultivo } = route.params;
  const CACHE_KEY = `@fenologia_data_${cultivo}`;
  
  // --- ESTADOS ---
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modoDetallado, setModoDetallado] = useState(false); 
  
  // Estados de UI
  const [regionSeleccionada, setRegionSeleccionada] = useState(null);
  const [sistemaExpanded, setSistemaExpanded] = useState(null);
  const [etapaExpanded, setEtapaExpanded] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  // --- CARGA DE DATOS ---
  const cargarDatos = async () => {
    setLoading(true);
    try {
      const rtdb = getDatabase(app);
      const dbRef = ref(rtdb);
      const ruta = `cultivos/${cultivo}`;
      
      console.log(`🔍 Buscando datos en: ${ruta}`);
      const snapshot = await get(child(dbRef, ruta));
      
      if (snapshot.exists()) {
        const datosNuevos = snapshot.val();
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(datosNuevos));
        procesarYSetearDatos(datosNuevos);
      } else {
        const datosGuardados = await AsyncStorage.getItem(CACHE_KEY);
        if (datosGuardados) {
          const parsedData = JSON.parse(datosGuardados);
          procesarYSetearDatos(parsedData);
        } else {
           Alert.alert("Aviso", "No se encontró información fenológica.");
        }
      }
    } catch (error) {
      console.error("Error al cargar fenología:", error);
      Alert.alert("Error", "No se pudo cargar la información.");
    } finally {
      setLoading(false);
    }
  };

  const procesarYSetearDatos = (data) => {
    // AJUSTE JSON 07: Buscar bbch_detallado en la raíz o dentro de ciclo_fenologico
    const bbchData = data.bbch_detallado || data.ciclo_fenologico?.bbch_detallado;
    
    if (bbchData && Array.isArray(bbchData) && bbchData.length > 0) {
      setModoDetallado(true);
      // Ordenamos por código BBCH para secuencia lógica
      const bbchOrdenado = [...bbchData].sort((a, b) => {
        const valA = parseFloat(a.codigo_bbch) || 0;
        const valB = parseFloat(b.codigo_bbch) || 0;
        return valA - valB;
      });
      setCultivoData({ ...data, etapas_visualizacion: bbchOrdenado });
    } else {
      setModoDetallado(false);
      // Fallback a etapas básicas del ciclo fenológico
      const etapasBasicas = data.ciclo_fenologico?.etapas || [];
      setCultivoData({ ...data, etapas_visualizacion: etapasBasicas });
    }
  };

  // --- FUNCIÓN ROBUSTA PARA EXTRAER DURACIÓN ---
  const extraerNumero = (valor) => {
    if (!valor) return 0;
    // Convierte a string, elimina todo lo que no sea número, punto o guión
    const limpio = String(valor).replace(/[^0-9.-]/g, '');
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
  };

  const prepararDatosParaGantt = (etapas, esDetallado) => {
    if (!etapas || etapas.length === 0) return [];
    
    let ultimoDiaAcumulado = 0;

    return etapas.map((etapa, index) => {
      let duracion = 0;
      let fueCalculadoPorRango = false;

      // 1. Prioridad: Buscar en 'dias_desde_siembra' (común en BBCH)
      if (etapa.dias_desde_siembra) {
        const valStr = String(etapa.dias_desde_siembra);
        
        if (valStr.includes('-')) {
          // Es un rango "30-60"
          const partes = valStr.split('-');
          const inicio = extraerNumero(partes[0]);
          const fin = extraerNumero(partes[1]);
          if (fin > inicio) {
            duracion = fin - inicio;
            ultimoDiaAcumulado = fin;
            fueCalculadoPorRango = true;
          }
        } else {
          // Es un hito "60" (acumulado)
          const fin = extraerNumero(valStr);
          if (fin > 0) {
            // Si es acumulado, la duración es (fin - anterior)
            if (fin > ultimoDiaAcumulado) {
              duracion = fin - ultimoDiaAcumulado;
              ultimoDiaAcumulado = fin;
              fueCalculadoPorRango = true;
            } else {
              duracion = fin; // Asumimos duración directa
              ultimoDiaAcumulado += fin;
              fueCalculadoPorRango = true;
            }
          }
        }
      }

      // 2. Fallback: Buscar propiedades de duración directa
      if (!fueCalculadoPorRango) {
        // Intentamos leer cualquier campo posible de duración
        const d1 = extraerNumero(etapa.duracion_dias);
        const d2 = extraerNumero(etapa.dias);
        const d3 = extraerNumero(etapa.duracion);
        
        duracion = d1 || d2 || d3 || 0;
        
        if (duracion === 0 && esDetallado) duracion = 5; 
        
        ultimoDiaAcumulado += duracion;
      }

      // Construcción del nombre para el gráfico
      let nombreEtapa = etapa.nombre || `Etapa ${index + 1}`;
      if (esDetallado) {
        nombreEtapa = etapa.fase_original || etapa.descripcion_tecnica || nombreEtapa;
        if (etapa.codigo_bbch) {
          nombreEtapa = `BBCH ${etapa.codigo_bbch}: ${nombreEtapa}`;
        }
      }

      return {
        ...etapa,
        duracion_dias: Math.round(duracion), // Entero para el gráfico
        nombre: nombreEtapa
      };
    });
  };

  // --- LÓGICA DE CRUCE DE RIESGOS (NUEVO) ---
  const obtenerRiesgosDeEtapa = (nombreEtapa, codigoBbch) => {
    const riesgosRaw = cultivoData?.riesgos_detallados || cultivoData?.plagas_y_enfermedades || {};
    // Normalizamos a array
    const listaRiesgos = Array.isArray(riesgosRaw) ? riesgosRaw : Object.values(riesgosRaw);
    
    if (listaRiesgos.length === 0) return [];

    const etapaKey = nombreEtapa.toLowerCase();
    
    return listaRiesgos.filter(r => {
        const fases = r.fases_vulnerables || "";
        const fasesStr = Array.isArray(fases) ? fases.join(" ").toLowerCase() : String(fases).toLowerCase();
        
        // Coincidencia por nombre de etapa (ej: "Floración")
        const matchNombre = fasesStr.includes(etapaKey);
        
        // Coincidencia opcional por código BBCH si existe (ej: "60-69")
        const matchBbch = codigoBbch && fasesStr.includes(String(codigoBbch));

        return matchNombre || matchBbch || fasesStr.includes("todas");
    });
  };

  if (loading && !cultivoData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.loadingText}>Cargando datos fenológicos...</Text>
      </View>
    );
  }

  if (!cultivoData) return null;

  // Variables auxiliares
  const dataCiclo = cultivoData?.ciclo_fenologico || {};
  const variedades = dataCiclo.variedades_principales || [];
  const densidades = dataCiclo.densidad_plantacion?.sistemas || [];
  const calendarios = cultivoData?.calendarios_regionales || [];
  const alertas = cultivoData?.alertas_riesgos || {};
  const tieneAlertas = Array.isArray(alertas) ? alertas.length > 0 : Object.keys(alertas).length > 0;

  const etapasVisuales = cultivoData.etapas_visualizacion || [];
  
  // Procesamos los datos para el gráfico
  const datosGantt = prepararDatosParaGantt(etapasVisuales, modoDetallado);
  const duracionTotalCalculada = datosGantt.reduce((acc, e) => acc + (e.duracion_dias || 0), 0);

  return (
    <ScrollView style={styles.container}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{flex: 1}}>
            <Text style={styles.titulo}>Fenología: {cultivo}</Text>
            <Text style={styles.subtitle}>{modoDetallado ? "Datos fenológicos (BBCH)" : "Ciclo y Tiempos"}</Text>
        </View>
        <View style={[styles.badge, modoDetallado ? styles.badgeCompleto : null]}>
            <Text style={styles.badgeText}>{modoDetallado ? "✓ Completo" : "Básico"}</Text>
        </View>
      </View>

      {/* ---------------------------------------------------- */}
      {/* 1. CALENDARIOS DE SIEMBRA (EL "CUÁNDO")              */}
      {/* ---------------------------------------------------- */}
      {calendarios.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderSimple}>
            <MaterialCommunityIcons name="calendar-clock" size={24} color="#1976D2" />
            <Text style={styles.cardTitle}>Calendarios Regionales</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Fechas óptimas según tu zona</Text>
          
          {calendarios.map((cal, index) => (
            <TouchableOpacity 
              key={index}
              style={[styles.regionCard, regionSeleccionada === index && styles.regionCardSelected]}
              onPress={() => setRegionSeleccionada(regionSeleccionada === index ? null : index)}
            >
              <View style={styles.accordionHeader}>
                <View style={{flex: 1}}>
                  <Text style={styles.regionNombre}>📍 {cal.region}</Text>
                  {cal.altitud_msnm && (
                    <Text style={styles.regionAltitud}>Altitud: {cal.altitud_msnm} msnm</Text>
                  )}
                </View>
                <MaterialCommunityIcons 
                  name={regionSeleccionada === index ? "chevron-up" : "chevron-down"} 
                  size={24} 
                  color="#666" 
                />
              </View>
              
              {regionSeleccionada === index && (
                <View style={styles.accordionBody}>
                  <View style={styles.fechaRow}>
                    <MaterialCommunityIcons name="seed" size={20} color="#4CAF50" />
                    <View style={{marginLeft: 10, flex: 1}}>
                      <Text style={styles.fechaLabel}>Siembra</Text>
                      <Text style={styles.fechaValue}>
                        {cal.siembra_inicio} - {cal.siembra_fin}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.fechaRow}>
                    <MaterialCommunityIcons name="grain" size={20} color="#FF9800" />
                    <View style={{marginLeft: 10, flex: 1}}>
                      <Text style={styles.fechaLabel}>Cosecha</Text>
                      <Text style={styles.fechaValue}>
                        {cal.cosecha_inicio} - {cal.cosecha_fin}
                      </Text>
                    </View>
                  </View>
                  {cal.ventana_comercial && (
                    <View style={[styles.ventanaBox]}>
                      <Text style={styles.ventanaLabel}>💡 Ventana Comercial</Text>
                      <Text style={styles.ventanaTexto}>{cal.ventana_comercial}</Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. CICLO DE VIDA VISUAL (EL DESARROLLO)              */}
      {/* ---------------------------------------------------- */}
      <View style={styles.ganttContainer}>
        <View style={styles.cardHeaderSimple}>
            <MaterialCommunityIcons name="chart-timeline-variant" size={24} color="#333" />
            <Text style={styles.cardTitle}>Ciclo Fenológico ({duracionTotalCalculada} días)</Text>
        </View>
        <View style={{marginTop: 10}}>
            <GanttFenologico 
              etapas={datosGantt} 
              duracionTotal={duracionTotalCalculada} 
            />
        </View>
      </View>

      {/* DESGLOSE DE ETAPAS */}
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>
          {modoDetallado ? "Desglose Técnico (Escala BBCH)" : "Etapas de Desarrollo"}
        </Text>

        {etapasVisuales.map((etapa, index) => {
           const datosCalculados = datosGantt[index] || {};
           const isExpanded = etapaExpanded === index;
           
           const nombreEtapa = modoDetallado ? (etapa.fase_original || etapa.descripcion_tecnica) : etapa.nombre;
           const duracionTexto = `${datosCalculados.duracion_dias || '?'} días`;
           
           // Cálculo de Riesgos Específicos para esta etapa
           const riesgosEtapa = isExpanded ? obtenerRiesgosDeEtapa(nombreEtapa, etapa.codigo_bbch) : [];

           return (
          <TouchableOpacity 
            key={index} 
            style={[styles.cardEtapaTouchable, isExpanded && styles.cardEtapaExpanded]}
            onPress={() => setEtapaExpanded(isExpanded ? null : index)}
            activeOpacity={0.8}
          >
            {/* Cabecera Desplegable */}
            <View style={styles.accordionHeaderEtapa}>
              <View style={{flex: 1}}>
                {modoDetallado && etapa.codigo_bbch && (
                  <View style={styles.bbchBadgeContainer}>
                    <Text style={styles.bbchBadgeText}>BBCH {etapa.codigo_bbch}</Text>
                  </View>
                )}
                <Text style={styles.etapaNombre}>{nombreEtapa}</Text>
              </View>
              
              <View style={{alignItems: 'flex-end'}}>
                 <View style={styles.diasContainer}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color="#F57C00" />
                    <Text style={styles.diasText}>{duracionTexto}</Text>
                 </View>
                  <MaterialCommunityIcons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color="#666"
                    style={{marginTop: 5}} 
                  />
              </View>
            </View>

            {/* Cuerpo Desplegable */}
            {isExpanded && (
              <View style={styles.accordionBodyEtapa}>
                
                {/* 1. Descripción Técnica BBCH */}
                {modoDetallado && etapa.descripcion_tecnica && (
                  <View style={styles.descTecnicaContainer}>
                    <View style={{flexDirection:'row', alignItems:'center', marginBottom:4}}>
                        <MaterialCommunityIcons name="text-box-search-outline" size={16} color="#555" />
                        <Text style={styles.descTecnicaLabel}> Descripción Técnica:</Text>
                    </View>
                    <Text style={styles.descTecnicaText}>{etapa.descripcion_tecnica}</Text>
                  </View>
                )}

                {/* 2. Información Técnica */}
                {modoDetallado && (
                  <View style={styles.techInfoContainer}>
                    <View style={styles.rowInfo}>
                      {etapa.temperatura_optima && (
                        <View style={styles.infoTag}>
                          <MaterialCommunityIcons name="thermometer" size={16} color="#D32F2F" />
                          <Text style={styles.infoText}>Óptima: {etapa.temperatura_optima}°C</Text>
                        </View>
                      )}
                      {etapa.grados_dia_acumulados && (
                        <View style={styles.infoTag}>
                          <MaterialCommunityIcons name="fire" size={16} color="#E65100" />
                          <Text style={styles.infoText}>GDD: {etapa.grados_dia_acumulados}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
                
                {/* 3. SECCIÓN NUEVA: RIESGOS ESPECÍFICOS DE LA ETAPA */}
                {riesgosEtapa.length > 0 && (
                   <View style={styles.riesgosEtapaContainer}>
                       <View style={styles.riesgosHeader}>
                           <MaterialCommunityIcons name="shield-alert" size={18} color="#C62828" />
                           <Text style={styles.riesgosTitle}>Riesgos Fitosanitarios</Text>
                       </View>
                       {riesgosEtapa.map((riesgo, rIdx) => (
                           <View key={rIdx} style={styles.riesgoItem}>
                               <Text style={styles.riesgoNombre}>🐞 {riesgo.plaga || riesgo.enfermedad || riesgo.nombre}</Text>
                               {riesgo.tipo && <Text style={styles.riesgoTipo}>{riesgo.tipo}</Text>}
                               <Text style={styles.riesgoDesc}>{riesgo.sintomas_visuales || riesgo.riesgo || "Sin descripción"}</Text>
                               {riesgo.control_preventivo && (
                                   <Text style={styles.riesgoControl}><Text style={{fontWeight:'bold'}}>Control:</Text> {riesgo.control_preventivo}</Text>
                               )}
                           </View>
                       ))}
                   </View>
                )}

                {/* 4. Actividades Críticas */}
                {etapa.actividades_criticas && etapa.actividades_criticas.length > 0 && (
                      <View style={styles.activitiesContainer}>
                        <Text style={styles.activitiesTitle}>⚠️ Actividades Críticas:</Text>
                        {etapa.actividades_criticas.map((actividad, i) => (
                          <View key={i} style={styles.activityRow}>
                            <Ionicons name="checkmark-circle-outline" size={16} color="#2E7D32" />
                            <Text style={styles.activityText}>{actividad}</Text>
                          </View>
                        ))}
                      </View>
                )}
                
                {/* Descripción Simple */}
                {!modoDetallado && etapa.descripcion && (
                   <Text style={styles.descripcionSimple}>{etapa.descripcion}</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        )})}
      </View>

      {/* ---------------------------------------------------- */}
      {/* 3. DATOS BIOLÓGICOS (GENÉTICA Y ESPACIO)             */}
      {/* ---------------------------------------------------- */}
      
      {/* Variedades */}
      <View style={styles.card}>
        <View style={styles.cardHeaderSimple}>
          <MaterialCommunityIcons name="dna" size={24} color="#7B1FA2" />
          <Text style={styles.cardTitle}>Variedades Principales</Text>
        </View>
        <View style={styles.variedadesList}>
          {variedades.length > 0 ? (
            variedades.map((variedad, index) => (
              <View key={index} style={styles.variedadChip}>
                <MaterialCommunityIcons name="sprout" size={16} color="#7B1FA2" />
                <Text style={styles.variedadText}>{variedad}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noData}>No disponible</Text>
          )}
        </View>
      </View>

      {/* Sistemas de Plantación */}
      {densidades.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderSimple}>
            <MaterialCommunityIcons name="grid" size={24} color="#00897B" />
            <Text style={styles.cardTitle}>Densidad y Marcos de Plantación</Text>
          </View>
          {dataCiclo.densidad_plantacion?.nota && (
            <Text style={styles.infoText}>💡 {dataCiclo.densidad_plantacion.nota}</Text>
          )}
          {densidades.map((sistema, index) => (
            <TouchableOpacity 
              key={index}
              style={[styles.sistemaCard, sistemaExpanded === index && styles.sistemaCardExpanded]}
              onPress={() => setSistemaExpanded(sistemaExpanded === index ? null : index)}
            >
              <View style={styles.accordionHeader}>
                <View style={{flex: 1}}>
                  <Text style={styles.sistemaNombre}>{sistema.nombre}</Text>
                  <Text style={styles.sistemaArboles}>{sistema.arboles_ha} plantas/ha</Text>
                </View>
                <MaterialCommunityIcons 
                  name={sistemaExpanded === index ? "chevron-up" : "chevron-down"} 
                  size={22} 
                  color="#666" 
                />
              </View>
              {sistemaExpanded === index && (
                <View style={styles.accordionBody}>
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="ruler" size={18} color="#00897B" />
                    <Text style={styles.detailText}>Distancia: {sistema.distancia_m}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ---------------------------------------------------- */}
      {/* 4. ALERTAS CLIMÁTICAS (RIESGOS MACRO)                */}
      {/* ---------------------------------------------------- */}
      {tieneAlertas && (
        <View style={[styles.card, styles.alertCard]}>
          <View style={styles.cardHeaderSimple}>
            <MaterialCommunityIcons name="weather-lightning" size={24} color="#D32F2F" />
            <Text style={[styles.cardTitle, { color: '#D32F2F' }]}>Alertas Climáticas Críticas</Text>
          </View>
          
          <Text style={styles.alertSubtitle}>
            ⚠️ Riesgos generales por clima y entorno:
          </Text>

          {Array.isArray(alertas) 
            ? alertas.map((item, index) => (
                <View key={index} style={styles.alertItem}>
                  <Text style={styles.alertEtapa}>🚨 {item.etapa || "Etapa Crítica"}</Text>
                  <Text style={styles.alertDesc}>{item.riesgo || item.descripcion}</Text>
                  {item.umbral && <Text style={styles.alertUmbral}>Umbral: {item.umbral}</Text>}
                </View>
              ))
            : Object.keys(alertas).map((key, index) => {
                const valor = alertas[key];
                return (
                  <View key={index} style={styles.alertItem}>
                    <Text style={styles.alertEtapa}>🚨 {key}</Text>
                    <Text style={styles.alertDesc}>
                      {typeof valor === 'object' ? (valor.riesgo || valor.descripcion) : valor}
                    </Text>
                  </View>
                );
              })
          }
        </View>
      )}

    </ScrollView>
  );
}

// --- ESTILOS ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666' },

  // HEADER
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { fontSize: 22, fontWeight: "bold", color: '#1B5E20' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#E0E0E0' },
  badgeCompleto: { backgroundColor: '#4CAF50' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // SECTION SUBTITLE
  sectionSubtitle: { marginHorizontal: 15, marginBottom: 10, color: '#666', fontSize: 12, fontStyle:'italic' },

  // CARDS GENERALES
  card: { backgroundColor: '#fff', marginHorizontal: 15, padding: 16, borderRadius: 12, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
  cardHeaderSimple: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginLeft: 8 },
  infoText: { fontSize: 12, color: '#666', marginBottom: 12, fontStyle: 'italic' },

  // VARIEDADES
  variedadesList: { flexDirection: 'row', flexWrap: 'wrap' },
  variedadChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3E5F5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  variedadText: { fontSize: 13, color: '#7B1FA2', marginLeft: 4, fontWeight: '600' },
  noData: { fontSize: 13, color: '#999', fontStyle: 'italic' },

  // ACORDEONES GENÉRICOS
  accordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accordionBody: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E0E0E0' },

  // SISTEMAS DE PLANTACIÓN
  sistemaCard: { backgroundColor: '#F5F5F5', padding: 12, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  sistemaCardExpanded: { backgroundColor: '#E0F7FA', borderColor: '#00897B' },
  sistemaNombre: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  sistemaArboles: { fontSize: 13, color: '#00897B', fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailText: { fontSize: 13, color: '#555', marginLeft: 8 },

  // GANTT
  ganttContainer: { marginHorizontal: 15, padding: 15, backgroundColor: '#fff', borderRadius: 12, elevation: 2, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 15 },

  // LISTA ETAPAS
  listContainer: { paddingHorizontal: 15, paddingBottom: 20 },
  cardEtapaTouchable: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 12, borderLeftWidth: 5, borderLeftColor: '#43A047', elevation: 2 },
  cardEtapaExpanded: { backgroundColor: '#F1F8E9', borderColor: '#C5E1A5', borderWidth: 1, borderLeftWidth: 5 },
  
  accordionHeaderEtapa: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  accordionBodyEtapa: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E8F5E9' },

  bbchBadgeContainer: { backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 4, borderWidth: 1, borderColor: '#C8E6C9' },
  bbchBadgeText: { color: '#2E7D32', fontSize: 12, fontWeight: 'bold' },
  etapaNombre: { fontSize: 17, fontWeight: 'bold', color: '#333', flexWrap: 'wrap' },
  diasContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf:'flex-end' },
  diasText: { fontSize: 13, fontWeight: '600', color: '#E65100', marginLeft: 4 },
  
  // ESTILOS DESCRIPCIÓN TÉCNICA
  descTecnicaContainer: { marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  descTecnicaLabel: { fontSize: 12, fontWeight: 'bold', color: '#555' },
  descTecnicaText: { fontSize: 14, color: '#333', lineHeight: 20, fontStyle: 'italic', marginLeft: 22 },

  techInfoContainer: { marginBottom: 10 },
  rowInfo: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  infoTag: { flexDirection: 'row', alignItems: 'center', marginRight: 15, marginTop: 4 },
  infoText: { fontSize: 13, color: '#555', marginLeft: 4 },
  
  // ESTILOS NUEVOS PARA RIESGOS ESPECÍFICOS
  riesgosEtapaContainer: { backgroundColor: '#FFEBEE', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth:1, borderColor: '#EF9A9A' },
  riesgosHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: '#FFCDD2', paddingBottom: 4 },
  riesgosTitle: { fontWeight: 'bold', color: '#C62828', fontSize: 13 },
  riesgoItem: { marginBottom: 8 },
  riesgoNombre: { fontSize: 13, fontWeight: 'bold', color: '#B71C1C' },
  riesgoTipo: { fontSize: 11, color: '#D32F2F', fontStyle: 'italic', marginBottom: 2 },
  riesgoDesc: { fontSize: 12, color: '#444', lineHeight: 18 },
  riesgoControl: { fontSize: 12, color: '#2E7D32', marginTop: 3, fontStyle: 'italic' },

  activitiesContainer: { marginTop: 5, backgroundColor: '#fff', padding: 10, borderRadius: 8, borderWidth:1, borderColor:'#E0E0E0' },
  activitiesTitle: { fontSize: 13, fontWeight: 'bold', color: '#455A64', marginBottom: 5 },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  activityText: { fontSize: 13, color: '#455A64', marginLeft: 6, flex: 1, lineHeight:18 },
  descripcionSimple: { color: '#555', fontSize: 14, fontStyle: 'italic', lineHeight: 20 },

  // ALERTAS GENERALES
  alertCard: { backgroundColor: '#FFF3E0', borderColor: '#FFCC80', borderWidth: 1 },
  alertSubtitle: { fontSize: 12, color: '#E65100', marginBottom: 10, fontWeight: '600' },
  alertItem: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#FFE0B2' },
  alertEtapa: { fontSize: 14, fontWeight: 'bold', color: '#EF6C00' },
  alertDesc: { fontSize: 13, color: '#E65100', marginTop: 2 },
  alertUmbral: { fontSize: 11, color: '#F57C00', fontStyle: 'italic', marginTop: 2 },

  // CALENDARIOS
  regionCard: { backgroundColor: '#F5F5F5', padding: 14, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  regionCardSelected: { backgroundColor: '#E3F2FD', borderColor: '#1976D2' },
  regionNombre: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  regionAltitud: { fontSize: 12, color: '#666' },
  fechaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  fechaLabel: { fontSize: 12, color: '#666', marginBottom: 2 },
  fechaValue: { fontSize: 14, fontWeight: '600', color: '#333' },
  ventanaBox: { backgroundColor: '#FFF8E1', padding: 10, borderRadius: 8, marginTop: 8 },
  ventanaLabel: { fontSize: 12, fontWeight: 'bold', color: '#F57C00', marginBottom: 4 },
  ventanaTexto: { fontSize: 13, color: '#666' },
});