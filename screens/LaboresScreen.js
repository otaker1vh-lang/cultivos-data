import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import CultivoDataManager from "../utils/CultivoDataManager";

// --- IMPORTACIONES FIREBASE (NO MODIFICADAS) ---
import { db } from '../utils/firebase'; 
import { doc, getDoc } from 'firebase/firestore';

export default function LaboresScreen({ route }) {
  const { cultivo } = route.params;
  const CACHE_KEY = `@labores_data_${cultivo}`; 
  
  // --- ESTADOS (NO MODIFICADOS) ---
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingCompleto, setLoadingCompleto] = useState(false);
  const [nivel, setNivel] = useState('basico');
  const [debugInfo, setDebugInfo] = useState([]); 
  
  // Estados de expansión (NO MODIFICADOS)
  const [etapaExpandida, setEtapaExpandida] = useState(null);
  const [calendarioRiegoExpanded, setCalendarioRiegoExpanded] = useState(false);
  const [presupuestoExpanded, setPresupuestoExpanded] = useState(false);
  const [catPresupuestoExpanded, setCatPresupuestoExpanded] = useState(null);
  const [debugExpanded, setDebugExpanded] = useState(false); 

  // DEBUG (NO MODIFICADO)
  const addDebug = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    const debugEntry = {
      time: timestamp,
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };
    console.log(`🔍 [${timestamp}] ${message}`, data || '');
    setDebugInfo(prev => [...prev, debugEntry]);
  };

  // 1. CARGA INICIAL (NO MODIFICADO)
  useEffect(() => {
    cargarDatosBasicos();
  }, [cultivo]);

  // --- VARIABLES DE DATOS (AJUSTADAS PARA LEER FIREBASE) ---
  // Aquí aseguramos que lea las llaves correctas sin importar cómo vengan del JSON
  const planRiegoRaw = cultivoData?.calendario_riego || cultivoData?.calendario_riego_mensual || {};
  const presupuestoRaw = cultivoData?.presupuesto_labores_detallado || cultivoData?.presupuesto || {};

  // CARGA BÁSICA (NO MODIFICADO)
  const cargarDatosBasicos = async () => {
    try {
      setLoading(true);
      setDebugInfo([]); 
      addDebug(`📱 Iniciando carga para cultivo: ${cultivo}`);

      const datosGuardados = await AsyncStorage.getItem(CACHE_KEY);
      
      if (datosGuardados) {
        addDebug('✅ Datos encontrados en caché');
        const parsedData = JSON.parse(datosGuardados);
        setCultivoData(parsedData);
        
        // Verificamos si ya tenemos la data completa
        if (parsedData.presupuesto_labores_detallado || parsedData.presupuesto || parsedData.calendario_riego_mensual) {
          setNivel('completo');
        } else {
          setNivel('basico');
        }
        setLoading(false); 
      } else {
        const datos = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
        if (datos) {
          setCultivoData(datos);
          setNivel('basico');
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(datos));
        }
        setLoading(false);
      }
    } catch (error) {
      addDebug(`🚨 ERROR en cargarDatosBasicos: ${error.message}`, error);
      setLoading(false);
    }
  };

  // --- FUNCIÓN DE FIREBASE AJUSTADA ---
  // Esta función ahora busca específicamente los campos que faltaban
  const obtenerDatosFirebase = async () => {
    try {
      addDebug(`🔥 Consultando Firestore para: ${cultivo}`);
      
      // Referencia a la colección "cultivos"
      const docRef = doc(db, "cultivos", cultivo); 
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        addDebug('🔥 Datos encontrados en Firebase');
        
        // Retornamos los datos asegurando que las llaves coincidan con lo que espera la app
        return {
          ...data, // Traemos todo el documento
          
          // Mapeo forzoso para asegurar que se muestre el presupuesto
          presupuesto_labores_detallado: data.presupuesto_labores_detallado || data.presupuesto || {},
          
          // Mapeo forzoso para asegurar que se muestre el calendario de riego
          calendario_riego: data.calendario_riego_mensual || data.calendario_riego || {},
          
          // Sistemas de riego si existen
          sistemas_riego: data.sistemas_riego || []
        };
      } else {
        addDebug('⚠️ El documento no existe en Firebase');
        return null;
      }
    } catch (error) {
      addDebug(`🚨 Error Firebase: ${error.message}`);
      return null;
    }
  };

  // DESCARGA DATOS COMPLETOS (AJUSTADO)
  const descargarDatosCompletos = async () => {
    try {
      setLoadingCompleto(true);
      addDebug('🔄 Iniciando descarga de datos COMPLETOS...');
      
      // 1. Buscamos en Firebase con la nueva función ajustada
      const firebaseData = await obtenerDatosFirebase();
      
      if (firebaseData) {
        // 2. Mezclamos los datos nuevos con los existentes
        const datosCompletos = {
          ...cultivoData,
          ...firebaseData 
        };

        // 3. Verificamos si llegaron los datos clave
        const tienePresupuesto = Object.keys(datosCompletos.presupuesto_labores_detallado || {}).length > 0;
        const tieneRiego = Object.keys(datosCompletos.calendario_riego || {}).length > 0;

        if (tienePresupuesto || tieneRiego) {
          addDebug('💾 Guardando datos fusionados en caché...');
          setCultivoData(datosCompletos);
          setNivel('completo');
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(datosCompletos));
          Alert.alert("Actualizado", "Presupuesto y Calendario de Riego descargados correctamente.");
        } else {
          Alert.alert("Aviso", "Se conectó, pero no se encontró información detallada de presupuesto o riego.");
        }
      } else {
        Alert.alert("Sin datos", "No se encontró el cultivo en la base de datos.");
      }
    } catch (error) {
      addDebug(`🚨 ERROR: ${error.message}`, error);
      Alert.alert("Error", "Ocurrió un problema al conectar con la base de datos.");
    } finally {
      setLoadingCompleto(false);
    }
  };

  const limpiarCache = async () => {
    Alert.alert(
      "Limpiar Caché",
      "¿Deseas eliminar los datos guardados y volver a cargar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpiar",
          onPress: async () => {
            await AsyncStorage.removeItem(CACHE_KEY);
            addDebug('🗑️ Caché eliminado');
            cargarDatosBasicos();
          }
        }
      ]
    );
  };

  // --- RENDERIZADO (NO MODIFICADO EL DISEÑO) ---

  if (loading && !cultivoData) {
    return <ActivityIndicator size="large" style={styles.loader} color="#2E7D32" />;
  }

  if (!cultivoData) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="clipboard-alert" size={60} color="#CCC" />
        <Text style={styles.emptyTextMain}>No se encontraron datos para {cultivo}</Text>
        <TouchableOpacity style={styles.btnRetry} onPress={cargarDatosBasicos}>
          <Text style={styles.btnText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Variables para la vista
  const esDatosCompletos = nivel === 'completo';
  const laboresRaw = cultivoData?.labores_culturales || cultivoData?.labores || {};
  const agro = cultivoData?.requerimientos_agroclimaticos || {};
  const fertPrograma = cultivoData?.programa_fertilizacion || [];
  const fertCalculo = cultivoData?.calculo_fertilizacion?.recomendada || {};
  const sistemasRiego = cultivoData?.sistemas_riego || [];
  const postcosecha = cultivoData?.postcosecha || {};
  const economia = cultivoData?.economia_expandida || {};
  const costos = cultivoData?.costos_produccion_detallados || {};
  
  // Asignamos las variables procesadas al inicio
  const planRiego = planRiegoRaw;
  const presupuestoDetallado = presupuestoRaw;

  const etapas = Object.keys(laboresRaw).filter(key => 
    typeof laboresRaw[key] === 'object' && 
    !['resumen_costos_anuales', 'meta_ia'].includes(key)
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>

      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={{flex: 1}}>
            <Text style={styles.mainTitle}>Guía Técnica: {cultivo}</Text>
        </View>

        {esDatosCompletos ? (
             <View style={[styles.badge, styles.badgeCompleto]}>
               <Text style={styles.badgeText}>✓ Completo</Text>
             </View>
        ) : (
             <TouchableOpacity 
                style={styles.btnDescargar} 
                onPress={descargarDatosCompletos}
                disabled={loadingCompleto}
             >
                {loadingCompleto ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <>
                        <Ionicons name="cloud-download-outline" size={16} color="#fff" style={{marginRight:4}} />
                        <Text style={styles.btnDescargarText}>Obtener Datos</Text>
                    </>
                )}
             </TouchableOpacity>
        )}
      </View>

      {/* SECCIONES EXISTENTES (NO MODIFICADAS) */}

      {/* 1. SECCIÓN AGROCLIMÁTICA */}
      <SectionCard title="Requerimientos Técnicos" icon="earth" color="#795548">
        <View style={styles.grid2Col}>
          <InfoRow icon="thermometer" label="Temperatura" value={agro.temperatura || agro.clima_ideal} />
          <InfoRow icon="image-filter-hdr" label="Altitud" value={agro.altitud} />
          <InfoRow icon="water" label="Precipitación" value={agro.precipitacion || agro.riego_sugerido} />
          <InfoRow icon="flask" label="Suelo" value={agro.suelo || agro.tipo_suelo} />
          <InfoRow icon="test-tube" label="pH" value={agro.ph || agro.ph_optimo} />
        </View>
      </SectionCard>

      {/* 2. PROGRAMA DE FERTILIZACIÓN */}
      {(fertPrograma.length > 0 || Object.keys(fertCalculo).length > 0) && (
        <SectionCard title="Programa de Fertilización" icon="flask" color="#8E24AA">
          {Object.keys(fertCalculo).length > 0 && (
            <View style={styles.npkContainer}>
                <NPKBadge element="N" name="Nitrógeno" value={fertCalculo.N} color="#E3F2FD" textColor="#1565C0" />
                <NPKBadge element="P" name="Fósforo" value={fertCalculo.P} color="#FCE4EC" textColor="#AD1457" />
                <NPKBadge element="K" name="Potasio" value={fertCalculo.K} color="#FFF3E0" textColor="#EF6C00" />
            </View>
          )}
          
          {fertPrograma.length > 0 && (
            <View style={styles.programaContainer}>
              <Text style={styles.subTitle}>📋 Aplicaciones por Etapa</Text>
              {fertPrograma.map((etapa, idx) => (
                <View key={idx} style={styles.fertEtapaCard}>
                  <View style={styles.fertEtapaHeader}>
                    <Text style={styles.fertEtapaNombre}>{etapa.etapa}</Text>
                    {etapa.costo_ha && <Text style={styles.fertCosto}>${etapa.costo_ha.toLocaleString()}/ha</Text>}
                  </View>
                  <Text style={styles.fertFormula}>🧪 {etapa.formula}</Text>
                  <View style={styles.fertDetails}>
                    <Text style={styles.fertDetail}>📦 {etapa.dosis_kg_ha} kg/ha</Text>
                    <Text style={styles.fertDetail}>💧 {etapa.metodo_aplicacion}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </SectionCard>
      )}

      {/* 3. SISTEMAS DE RIEGO */}
      {sistemasRiego.length > 0 && (
        <SectionCard title="Sistemas de Riego" icon="water-pump" color="#0288D1">
          {sistemasRiego.map((sistema, idx) => (
            <View key={idx} style={styles.riegoCard}>
              <View style={styles.riegoHeader}>
                <MaterialCommunityIcons name="water" size={20} color="#0288D1" />
                <Text style={styles.riegoNombre}>{sistema.sistema}</Text>
                <Text style={styles.riegoEficiencia}>{sistema.eficiencia_pct}% eficiente</Text>
              </View>
              <View style={styles.riegoDetails}>
                <Text style={styles.riegoDetail}>💰 Instalación: ${sistema.costo_instalacion_ha?.toLocaleString()}/ha</Text>
                <Text style={styles.riegoDetail}>🔧 Operación: ${sistema.costo_operacion_anual?.toLocaleString()}/año</Text>
                <Text style={styles.riegoDetail}>💧 Lámina: {sistema.lamina_anual_mm} mm/año</Text>
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      {/* --- SECCIÓN CALENDARIO DE RIEGO --- */}
      {(Object.keys(planRiego).length > 0) ? (
         <TouchableOpacity 
            style={[styles.card, { borderLeftColor: '#039BE5' }]} 
            onPress={() => setCalendarioRiegoExpanded(!calendarioRiegoExpanded)}
         >
            <View style={[styles.cardHeader, {justifyContent: 'space-between'}]}>
               <View style={{flexDirection:'row', alignItems:'center', gap:10}}>
                  <MaterialCommunityIcons name="calendar-month" size={22} color="#039BE5" />
                  <Text style={[styles.cardTitle, { color: '#039BE5' }]}>Calendario de Riego</Text>
               </View>
               <MaterialCommunityIcons name={calendarioRiegoExpanded ? "chevron-up" : "chevron-down"} size={24} color="#666" />
            </View>
            
            {calendarioRiegoExpanded && (
               <View style={styles.accordionContent}>
                  {planRiego.requerimientos_hidricos && (
                      <View style={styles.infoRowContainer}>
                          <Text style={styles.hidricoInfo}>
                            💧 Lámina total: <Text style={{fontWeight:'bold'}}>{planRiego.requerimientos_hidricos.lamina_total_mm || '-'} mm</Text>
                          </Text>
                          <Text style={styles.hidricoInfo}>
                             🎯 Eficiencia: <Text style={{fontWeight:'bold'}}>{planRiego.requerimientos_hidricos.eficiencia_riego || '-'}%</Text>
                          </Text>
                      </View>
                  )}
                  
                  <View style={styles.tableHeader}>
                     <Text style={[styles.tableHeadText, {flex:1}]}>Etapa</Text>
                     <Text style={[styles.tableHeadText, {width:90, textAlign:'center'}]}>Frecuencia</Text>
                     <Text style={[styles.tableHeadText, {width:70, textAlign:'right'}]}>Lámina</Text>
                  </View>
                  
                  {(Array.isArray(planRiego) ? planRiego : planRiego.calendario_riego || []).map((item, index) => (
                     <View key={index} style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}>
                        <Text style={[styles.tableCell, {flex:1}]}>{item.etapa || item.mes}</Text>
                        <Text style={[styles.tableCell, {width:90, textAlign:'center'}]}>
                          {item.frecuencia_dias ? `c/${item.frecuencia_dias}d` : item.riegos || '-'}
                        </Text>
                        <Text style={[styles.tableCell, {width:70, textAlign:'right'}]}>{item.lamina_mm} mm</Text>
                     </View>
                  ))}
               </View>
            )}
         </TouchableOpacity>
      ) : (
        <View style={styles.warningCard}>
          <Text style={styles.warningCardText}>⚠️ Calendario de riego no disponible</Text>
        </View>
      )}

      {/* 4. CALENDARIO DE LABORES (ETAPAS) */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>🚜 Calendario de Actividades</Text>
        {etapas.length > 0 && <Text style={styles.sectionHeaderSubtitle}>{etapas.length} etapas</Text>}
      </View>
      
      {etapas.length > 0 ? etapas.map((etapa, index) => {
        const contenido = laboresRaw[etapa];
        let actividades = [];
        if (Array.isArray(contenido)) {
          actividades = contenido.map(item => typeof item === 'string' ? { labor: item, descripcion: '' } : item);
        } else if (contenido?.actividades) {
          actividades = contenido.actividades;
        }

        return (
          <TouchableOpacity 
            key={index} 
            style={[styles.etapaCard, etapaExpandida === index && styles.etapaCardActive]}
            onPress={() => setEtapaExpandida(etapaExpandida === index ? null : index)}
          >
            <View style={styles.etapaHeader}>
              <View style={styles.etapaHeaderLeft}>
                <Text style={styles.etapaTitle}>🔹 {etapa}</Text>
                <Text style={styles.etapaCount}>{actividades.length} actividades</Text>
              </View>
              <MaterialCommunityIcons name={etapaExpandida === index ? "chevron-up" : "chevron-down"} size={24} color="#666" />
            </View>

            {etapaExpandida === index && (
              <View style={styles.actividadesContainer}>
                {actividades.length > 0 ? actividades.map((act, i) => (
                  <View key={i} style={styles.actividadItem}>
                    <Text style={styles.actTitle}>✅ {act.labor || act.practica || "Actividad"}</Text>
                    {(act.objetivo || act.descripcion) && (
                      <Text style={styles.actDesc}>{act.objetivo || act.descripcion}</Text>
                    )}
                  </View>
                )) : (
                  <Text style={styles.emptyText}>Sin detalles específicos.</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        );
      }) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTextMain}>Información de labores no disponible.</Text>
        </View>
      )}

      {/* --- SECCIÓN PRESUPUESTO --- */}
      {Object.keys(presupuestoDetallado).length > 0 ? (
          <TouchableOpacity 
             style={[styles.card, { borderLeftColor: '#7B1FA2' }]} 
             onPress={() => setPresupuestoExpanded(!presupuestoExpanded)}
          >
             <View style={[styles.cardHeader, {justifyContent: 'space-between'}]}>
                <View style={{flexDirection:'row', alignItems:'center', gap:10}}>
                   <MaterialCommunityIcons name="finance" size={22} color="#7B1FA2" />
                   <Text style={[styles.cardTitle, { color: '#7B1FA2' }]}>Desglose de Costos</Text>
                </View>
                <MaterialCommunityIcons name={presupuestoExpanded ? "chevron-up" : "chevron-down"} size={24} color="#666" />
             </View>

             {presupuestoExpanded && (
                <View style={styles.accordionContent}>
                    {Object.keys(presupuestoDetallado).map((catKey, idx) => {
                        const categoryData = presupuestoDetallado[catKey];
                        if (!categoryData.actividades) return null;

                        const isExpanded = catPresupuestoExpanded === catKey;
                        const totalCat = categoryData.actividades.reduce((sum, item) => sum + (item.costo_ha || 0), 0);

                        return (
                          <View key={idx} style={styles.presupuestoCatContainer}>
                             <TouchableOpacity 
                                style={styles.presupuestoCatHeader} 
                                onPress={() => setCatPresupuestoExpanded(isExpanded ? null : catKey)}
                             >
                                <View style={{flex:1}}>
                                  <Text style={styles.presupuestoCatTitle}>{catKey}</Text>
                                  <Text style={styles.presupuestoCatTotal}>Total: ${totalCat.toLocaleString()}</Text>
                                </View>
                                <MaterialCommunityIcons name={isExpanded ? "minus" : "plus"} size={20} color="#7B1FA2" />
                             </TouchableOpacity>
                             
                             {isExpanded && categoryData.actividades.map((act, i) => (
                                <View key={i} style={styles.presupuestoRow}>
                                   <View style={{flex:1}}>
                                     <Text style={styles.presupuestoLabor}>{act.labor}</Text>
                                     {act.epoca && <Text style={styles.presupuestoEpoca}>📅 {act.epoca}</Text>}
                                   </View>
                                   <Text style={styles.presupuestoCosto}>${(act.costo_ha || act.costo_kg || 0).toLocaleString()}</Text>
                                </View>
                             ))}
                          </View>
                        );
                    })}
                </View>
             )}
          </TouchableOpacity>
      ) : (
        <View style={styles.warningCard}>
          <Text style={styles.warningCardText}>⚠️ Presupuesto detallado no disponible</Text>
        </View>
      )}

      {/* 6. ECONOMÍA */}
      {(Object.keys(economia).length > 0 || Object.keys(costos).length > 0) && (
        <SectionCard title="Análisis Económico" icon="currency-usd" color="#1B5E20">
          {economia.precio_min_mxn_ton && economia.precio_max_mxn_ton && (
            <View style={styles.preciosContainer}>
              <View style={styles.precioBox}>
                <Text style={styles.precioLabel}>Precio Mínimo</Text>
                <Text style={styles.precioValue}>${economia.precio_min_mxn_ton.toLocaleString()}</Text>
                <Text style={styles.precioUnidad}>MXN/ton</Text>
              </View>
              <View style={styles.precioBox}>
                <Text style={styles.precioLabel}>Precio Máximo</Text>
                <Text style={styles.precioValue}>${economia.precio_max_mxn_ton.toLocaleString()}</Text>
                <Text style={styles.precioUnidad}>MXN/ton</Text>
              </View>
            </View>
          )}
          {costos.costo_por_kg_produccion && (
            <View style={styles.row}>
              <Text style={styles.labelBold}>Costo de Producción:</Text>
              <Text style={styles.valueText}>${costos.costo_por_kg_produccion} MXN/kg</Text>
            </View>
          )}
        </SectionCard>
      )}

    </ScrollView>
  );
}

// --- SUB-COMPONENTES (NO MODIFICADOS) ---

const SectionCard = ({ title, icon, color, children }) => (
  <View style={[styles.card, { borderLeftColor: color }]}>
    <View style={styles.cardHeader}>
      <MaterialCommunityIcons name={icon} size={22} color={color} />
      <Text style={[styles.cardTitle, { color }]}>{title}</Text>
    </View>
    {children}
  </View>
);

const InfoRow = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={18} color="#555" />
      <View style={{flex:1}}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{typeof value === 'object' ? 'Ver detalle' : value}</Text>
      </View>
    </View>
  );
};

const NPKBadge = ({ element, name, value, color, textColor }) => (
  <View style={[styles.npkBadge, { backgroundColor: color }]}>
    <Text style={[styles.npkElement, { color: textColor }]}>{element}</Text>
    <Text style={[styles.npkValue, { color: textColor }]}>{value || '-'} kg/ha</Text>
    <Text style={styles.npkName}>{name}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA", padding: 15 },
  loader: { flex: 1, marginTop: 50 },
  
  // 🔍 ESTILOS DEBUG
  debugPanel: { backgroundColor: '#FFF3E0', borderRadius: 12, marginBottom: 15, borderLeftWidth: 5, borderLeftColor: '#FF5722', elevation: 3 },
  debugHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  debugTitle: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#BF360C' },
  debugContent: { maxHeight: 300, padding: 12, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#FFE0B2' },
  debugEntry: { backgroundColor: '#fff', padding: 8, borderRadius: 6, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#FF9800' },
  debugTime: { fontSize: 10, color: '#FF6F00', fontWeight: 'bold' },
  debugMessage: { fontSize: 12, color: '#333', marginTop: 4 },
  debugData: { fontSize: 10, color: '#666', fontFamily: 'monospace', marginTop: 4, backgroundColor: '#F5F5F5', padding: 6, borderRadius: 4 },
  btnLimpiarCache: { backgroundColor: '#F44336', padding: 10, borderRadius: 8, marginBottom: 12, alignItems: 'center' },
  btnLimpiarText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  warningCard: { backgroundColor: '#FFEBEE', padding: 15, borderRadius: 10, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#F44336' },
  warningCardText: { color: '#C62828', fontSize: 13, fontWeight: '600' },
  
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  mainTitle: { fontSize: 24, fontWeight: "bold", color: "#1B5E20" },
  
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeCompleto: { backgroundColor: '#4CAF50' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  btnDescargar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1976D2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginLeft: 10 },
  btnDescargarText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2, borderLeftWidth: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  accordionContent: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10 },
  
  grid2Col: { flexDirection: 'row', flexWrap: 'wrap' },
  infoRow: { flexDirection: 'row', width: '50%', marginBottom: 12, alignItems: 'center', gap: 8, paddingRight: 5 },
  infoLabel: { fontSize: 11, color: '#777' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  labelBold: { fontWeight: 'bold', color: '#444', fontSize: 13 },
  valueText: { color: '#333', flex: 1, textAlign: 'right', fontSize: 13 },
  
  npkContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  npkBadge: { width: '31%', padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  npkElement: { fontSize: 18, fontWeight: '900' },
  npkValue: { fontSize: 12, fontWeight: 'bold', marginVertical: 2 },
  npkName: { fontSize: 10, color: '#666' },
  
  subTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 10 },
  programaContainer: { marginTop: 10 },
  fertEtapaCard: { backgroundColor: '#F8F9FA', padding: 12, borderRadius: 8, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#8E24AA' },
  fertEtapaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fertEtapaNombre: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  fertCosto: { fontSize: 12, color: '#1B5E20', fontWeight: '600' },
  fertFormula: { fontSize: 13, color: '#8E24AA', marginBottom: 6 },
  fertDetails: { flexDirection: 'row', gap: 15 },
  fertDetail: { fontSize: 12, color: '#666' },
  
  riegoCard: { backgroundColor: '#F8F9FA', padding: 12, borderRadius: 8, marginBottom: 10 },
  riegoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  riegoNombre: { fontSize: 14, fontWeight: 'bold', color: '#333', flex: 1 },
  riegoEficiencia: { fontSize: 11, backgroundColor: '#E3F2FD', color: '#1565C0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, fontWeight: '600' },
  riegoDetails: { marginBottom: 8 },
  riegoDetail: { fontSize: 12, color: '#666', marginBottom: 3 },
  
  // Tabla
  infoRowContainer: { flexDirection:'row', justifyContent:'space-between', marginBottom: 12, paddingHorizontal: 4 },
  hidricoInfo: { fontSize: 12, color: '#444' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#E1F5FE', padding: 8, borderRadius: 6, marginBottom: 4 },
  tableHeadText: { fontWeight: 'bold', fontSize: 12, color: '#0277BD' },
  tableRow: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tableRowEven: { backgroundColor: '#FAFAFA' },
  tableCell: { fontSize: 12, color: '#333' },

  // Presupuesto
  presupuestoCatContainer: { marginBottom: 10, backgroundColor: '#F3E5F5', borderRadius: 8, overflow:'hidden' },
  presupuestoCatHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, justifyContent:'space-between' },
  presupuestoCatTitle: { fontWeight: 'bold', color: '#6A1B9A', fontSize: 14 },
  presupuestoCatTotal: { fontSize: 12, color: '#8E24AA' },
  
  presupuestoRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingLeft: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3E5F5' },
  presupuestoLabor: { fontSize: 13, color: '#333', fontWeight: '500' },
  presupuestoEpoca: { fontSize: 11, color: '#888', marginTop: 2 },
  presupuestoCosto: { fontSize: 13, color: '#2E7D32', fontWeight: 'bold' },

  // Sección Header
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 15 },
  sectionHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  sectionHeaderSubtitle: { fontSize: 12, color: '#666', backgroundColor: '#E0E0E0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  
  etapaCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, elevation: 1, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E0E0' },
  etapaCardActive: { borderColor: '#2E7D32', borderWidth: 2 },
  etapaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#fff' },
  etapaHeaderLeft: { flex: 1 },
  etapaTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  etapaCount: { fontSize: 11, color: '#666' },
  
  actividadesContainer: { padding: 15, paddingTop: 5, backgroundColor: '#FAFAFA', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  actividadItem: { marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#81C784', paddingLeft: 10 },
  actTitle: { fontSize: 14, fontWeight: 'bold', color: '#2E7D32' },
  actDesc: { fontSize: 13, color: '#555', marginTop: 2, lineHeight: 18 },
  
  preciosContainer: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  precioBox: { flex: 1, backgroundColor: '#F1F8E9', padding: 12, borderRadius: 8, alignItems: 'center' },
  precioLabel: { fontSize: 11, color: '#689F38', marginBottom: 4 },
  precioValue: { fontSize: 18, fontWeight: 'bold', color: '#33691E', marginBottom: 2 },
  precioUnidad: { fontSize: 10, color: '#7CB342' },
  
  emptyText: { fontStyle: 'italic', color: '#999', padding: 10, fontSize: 13 },
  emptyContainer: { padding: 30, alignItems: 'center' },
  emptyTextMain: { color: '#999', fontSize: 16, textAlign: 'center', marginTop: 10 },
  
  btnRetry: { backgroundColor: '#2E7D32', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 20 },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
});