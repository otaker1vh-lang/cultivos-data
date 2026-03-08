import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  Alert,
  RefreshControl // <-- IMPORTACIÓN NUEVA
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import CultivoDataManager from "../utils/CultivoDataManager";

// --- SE ELIMINARON LAS IMPORTACIONES DIRECTAS DE FIREBASE ---

export default function LaboresScreen({ route }) {
  const { cultivo } = route.params;
  const CACHE_KEY = `@labores_data_${cultivo}`; 
  
  // --- ESTADOS ---
  const [cultivoData, setCultivoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // <-- NUEVO ESTADO PARA REFRESH
  const [loadingCompleto, setLoadingCompleto] = useState(false);
  const [nivel, setNivel] = useState('basico');
  const [debugInfo, setDebugInfo] = useState([]); 
  
  // Estados de expansión (Accordions)
  const [etapaExpandida, setEtapaExpandida] = useState(null);
  const [calendarioRiegoExpanded, setCalendarioRiegoExpanded] = useState(false);
  const [infraRiegoExpanded, setInfraRiegoExpanded] = useState(false);
  const [presupuestoExpanded, setPresupuestoExpanded] = useState(false);
  const [catPresupuestoExpanded, setCatPresupuestoExpanded] = useState(null);
  const [deficienciasExpanded, setDeficienciasExpanded] = useState(false);
  const [fertProgramaExpanded, setFertProgramaExpanded] = useState(false);

  // DEBUG
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

  // 1. CARGA INICIAL
  useEffect(() => {
    cargarDatosBasicos(false);
  }, [cultivo]);

  // CARGA BÁSICA (Adaptada para aceptar isRefreshing)
  const cargarDatosBasicos = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      
      // TODO pasa por el DataManager: Caché -> Nube -> Fallback Local
      const datos = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');

      if (datos) {
        setCultivoData(datos);
        
        if (datos.presupuesto_labores_detallado || datos.calendario_riego_mensual || datos._origen === 'nube') {
          setNivel('completo');
        } else {
          setNivel('basico');
        }
      } else {
        Alert.alert("Error", "No hay conexión ni datos locales disponibles.");
      }
    } catch (error) {
      console.log("Fallo en la carga de datos:", error);
      Alert.alert("Error", "No se pudo cargar la información.");
    } finally {
      if (!isRefreshing) setLoading(false);
    }
  };

  // --- NUEVA FUNCIÓN PARA EL REFRESH CONTROL ---
  const onRefresh = async () => {
    setRefreshing(true);
    await cargarDatosBasicos(true);
    setRefreshing(false);
  };

  // --- FUNCIÓN REFACCIONADA PARA USAR EL MANAGER EN LUGAR DE FIREBASE DIRECTO ---
  const obtenerDatosFirebase = async (manual = false) => {
    try {
      setLoadingCompleto(true);
      
      // Obtenemos los datos actualizados a través del administrador
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');

      if (data) {
        // Mapeo y Normalización para compatibilidad con JSON 07
        const dataNormalizada = {
          ...data,
          // 1. Asegurar que el calendario de riego se lea de la clave correcta
          calendario_riego: data.calendario_riego_mensual || data.calendario_riego || [],
          
          // 2. Normalizar Labores/Actividades (el JSON 07 las tiene en 'labores_culturales')
          labores_culturales: data.labores_culturales || data.labores || [],
          
          // 3. Manejo de Infraestructura de Riego (sistemas_recomendados en JSON 07)
          sistemas_recomendados: data.sistemas_recomendados || data.sistemas_riego || [],
          
          // 4. Costos y Presupuesto (costos_produccion_detallados en JSON 07)
          presupuesto_estimado: data.costos_produccion_detallados || data.presupuesto_estimado || null,
        };

        setCultivoData(dataNormalizada);
        setNivel('completo');
        if(manual) Alert.alert("Éxito", "Datos actualizados correctamente.");
        return dataNormalizada;
      } else {
        console.log("No se hallaron datos del cultivo en el manager.");
        return null;
      }
    } catch (error) {
      console.error("Error obteniendo datos completos:", error);
      return null;
    } finally {
      setLoadingCompleto(false);
    }
  };

  // DESCARGA DATOS COMPLETOS
  const descargarDatosCompletos = async () => {
    try {
      setLoadingCompleto(true);
      addDebug('🔄 Iniciando actualización de datos COMPLETOS...');
      
      const firebaseData = await obtenerDatosFirebase(false);
      
      if (firebaseData) {
        const datosCompletos = {
          ...cultivoData,
          ...firebaseData 
        };

        const tienePresupuesto = Object.keys(datosCompletos.presupuesto_labores_detallado || datosCompletos.presupuesto_estimado || {}).length > 0;
        const tieneRiego = Object.keys(datosCompletos.calendario_riego || {}).length > 0;

        if (tienePresupuesto || tieneRiego || datosCompletos._origen === 'nube') {
          setCultivoData(datosCompletos);
          setNivel('completo');
          Alert.alert("Actualizado", "Datos descargados correctamente.");
        } else {
          Alert.alert("Aviso", "No se encontró información detallada adicional.");
        }
      } else {
        Alert.alert("Sin datos", "No se encontró el cultivo.");
      }
    } catch (error) {
      addDebug(`🚨 ERROR: ${error.message}`, error);
      Alert.alert("Error", "Ocurrió un problema al actualizar los datos.");
    } finally {
      setLoadingCompleto(false);
    }
  };

  // --- RENDERIZADO ---
  if (loading && !refreshing && !cultivoData) {
    return <ActivityIndicator size="large" style={styles.loader} color="#2E7D32" />;
  }

  if (!cultivoData) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="clipboard-alert" size={60} color="#CCC" />
        <Text style={styles.emptyTextMain}>No se encontraron datos para {cultivo}</Text>
        <TouchableOpacity style={styles.btnRetry} onPress={() => cargarDatosBasicos(false)}>
          <Text style={styles.btnText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Variables para la vista
  const esDatosCompletos = nivel === 'completo';
  const laboresRaw = cultivoData?.labores_culturales || cultivoData?.labores || {};
  const fertPrograma = cultivoData?.programa_fertilizacion || [];
  const fertCalculo = cultivoData?.calculo_fertilizacion?.recomendada || {};
  const sistemasRiego = cultivoData?.sistemas_recomendados || 
                      (Array.isArray(cultivoData?.sistemas_riego) ? cultivoData.sistemas_riego : []);
  const costos = cultivoData?.costos_produccion_detallados || {};
  
  // VARIABLES (POSTCOSECHA Y DEFICIENCIAS)
  const postcosecha = cultivoData?.postcosecha || cultivoData?.manejo_postcosecha || {};
  const fisiologia = cultivoData?.fisiologia_nutricion || {};
  const deficiencias = fisiologia.sintomas_deficiencia || cultivoData?.deficiencias_nutricionales || {};

  const planRiego = cultivoData?.calendario_riego || cultivoData?.calendario_riego_mensual || {};
  const presupuestoDetallado = cultivoData?.presupuesto_estimado || cultivoData?.presupuesto_labores_detallado || cultivoData?.presupuesto || {};

  // ORDENAMIENTO DE ETAPAS (LÓGICA MEJORADA)
  const ordenLogico = [
    'establecimiento', 
    'siembra', 
    'brotacion', 
    'vegetativo', 
    'crecimiento', 
    'desarrollo', 
    'floracion', 
    'floración', 
    'cuajado', 
    'fructificacion', 
    'fructificación', 
    'llenado', 
    'maduracion', 
    'cosecha', 
    'dormancia'
  ];

  const etapas = Object.keys(laboresRaw).filter(key => 
    typeof laboresRaw[key] === 'object' && 
    !['resumen_costos_anuales', 'meta_ia'].includes(key)
  ).sort((a, b) => {
      // Función para encontrar el índice en el array de prioridad
      const indexA = ordenLogico.findIndex(p => a.toLowerCase().includes(p));
      const indexB = ordenLogico.findIndex(p => b.toLowerCase().includes(p));
      
      // Si ambos existen en la lista, ordenar por índice
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      // Si solo A existe, A va primero
      if (indexA !== -1) return -1;
      // Si solo B existe, B va primero
      if (indexB !== -1) return 1;
      // Si ninguno existe, mantener orden alfabético o original
      return 0;
  });

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={{ paddingBottom: 60 }}
      // --- INTEGRACIÓN DEL REFRESH CONTROL ---
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={["#2E7D32", "#1976D2"]} // Colores para Android
          tintColor="#2E7D32" // Color para iOS
        />
      }
    >

      {/* Header Operativo */}
      <View style={styles.headerContainer}>
        <View style={{flex: 1}}>
            <Text style={styles.mainTitle}>Guía Operativa: {cultivo}</Text>
            <Text style={styles.subHeader}>Manual de Ejecución, Calidad y Costos</Text>
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

      {/* ==================================================== */}
      {/* 1. PLAN DE TRABAJO (ETAPAS ORDENADAS)                */}
      {/* ==================================================== */}
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="tractor" size={24} color="#333" />
        <Text style={styles.sectionHeaderTitle}>Plan de Trabajo</Text>
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

      {/* ==================================================== */}
      {/* 2. PLAN NUTRICIONAL (MOVIDO ARRIBA)                  */}
      {/* ==================================================== */}
      {(fertPrograma.length > 0 || Object.keys(fertCalculo).length > 0 || Object.keys(deficiencias).length > 0) && (
        <View style={{marginTop: 25}}>
            <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="flask" size={24} color="#8E24AA" />
                <Text style={styles.sectionHeaderTitle}>Plan Nutricional</Text>
            </View>
            
            <View style={[styles.card, { borderLeftColor: '#8E24AA' }]}>
                {/* FICHA DOSIS DE FERTILIZACIÓN */}
                {Object.keys(fertCalculo).length > 0 && (
                    <View style={styles.dosisCard}>
                        <View style={styles.dosisHeader}>
                            <MaterialCommunityIcons name="beaker-check" size={20} color="#8E24AA" />
                            <Text style={styles.dosisTitle}>Dosis de Fertilización (Unidades/ha)</Text>
                        </View>
                        
                        {/* Macronutrientes */}
                        <View style={styles.npkContainer}>
                            <NPKBadge element="N" name="Nitrógeno" value={fertCalculo.N} color="#E3F2FD" textColor="#1565C0" />
                            <NPKBadge element="P" name="Fósforo" value={fertCalculo.P} color="#FCE4EC" textColor="#AD1457" />
                            <NPKBadge element="K" name="Potasio" value={fertCalculo.K} color="#FFF3E0" textColor="#EF6C00" />
                        </View>

                        {/* Micros */}
                        <View style={styles.microsContainer}>
                            {['Ca', 'Mg', 'S'].map(el => fertCalculo[el] ? (
                                <View key={el} style={styles.microTag}>
                                    <Text style={styles.microText}>{el}: {fertCalculo[el]}</Text>
                                </View>
                            ) : null)}
                        </View>
                    </View>
                )}

                {/* GUÍA DE DEFICIENCIAS */}
                {Object.keys(deficiencias).length > 0 && (
                    <TouchableOpacity 
                        style={styles.deficienciasBtn} 
                        onPress={() => setDeficienciasExpanded(!deficienciasExpanded)}
                    >
                        <View style={{flexDirection:'row', alignItems:'center'}}>
                        <MaterialCommunityIcons name="leaf" size={20} color="#C62828" />
                        <Text style={styles.deficienciasTitle}>Guía de Síntomas de Deficiencia</Text>
                        </View>
                        <MaterialCommunityIcons name={deficienciasExpanded ? "chevron-up" : "chevron-down"} size={20} color="#C62828" />
                    </TouchableOpacity>
                )}

                {deficienciasExpanded && (
                    <View style={styles.deficienciasContainer}>
                        {Object.keys(deficiencias).map((elem, i) => (
                            <View key={i} style={styles.deficienciaItem}>
                                <View style={styles.deficienciaHeader}>
                                    <Text style={styles.defElemento}>{elem}</Text>
                                    <Text style={styles.defSintoma}>{deficiencias[elem]}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
                
                {/* PROGRAMA DE APLICACIÓN POR ETAPAS (AHORA DESPLEGABLE) */}
                {fertPrograma.length > 0 && (
                    <View style={{marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEE'}}>
                        <TouchableOpacity 
                            style={[styles.cardHeader, {marginTop: 10, justifyContent: 'space-between'}]}
                            onPress={() => setFertProgramaExpanded(!fertProgramaExpanded)}
                        >
                            <View style={{flexDirection:'row', alignItems:'center', gap:10}}>
                                <MaterialCommunityIcons name="format-list-checks" size={20} color="#4A148C" />
                                <Text style={styles.subTitleNoMargin}>Aplicaciones por Etapa</Text>
                            </View>
                            <MaterialCommunityIcons name={fertProgramaExpanded ? "chevron-up" : "chevron-down"} size={24} color="#666" />
                        </TouchableOpacity>

                        {fertProgramaExpanded && (
                            <View style={styles.programaContainer}>
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
                    </View>
                )}
            </View>
        </View>
      )}

      {/* ==================================================== */}
      {/* 3. CALENDARIO DE RIEGOS                              */}
      {/* ==================================================== */}
      <View style={[styles.sectionHeader, {marginTop: 25}]}>
         <MaterialCommunityIcons name="water" size={24} color="#039BE5" />
         <Text style={styles.sectionHeaderTitle}>Riegos</Text>
      </View>

      {(Object.keys(planRiego).length > 0) && (
         <TouchableOpacity 
            style={[styles.card, { borderLeftColor: '#039BE5' }]} 
            onPress={() => setCalendarioRiegoExpanded(!calendarioRiegoExpanded)}
         >
            <View style={[styles.cardHeader, {justifyContent: 'space-between'}]}>
               <View style={{flexDirection:'row', alignItems:'center', gap:10}}>
                  <MaterialCommunityIcons name="calendar-month" size={22} color="#039BE5" />
                  <Text style={[styles.cardTitle, { color: '#039BE5' }]}>Calendario de Riegos</Text>
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
      )}

      {/* ==================================================== */}
      {/* 4. INFRAESTRUCTURA DE RIEGO (DESPLEGABLE)            */}
      {/* ==================================================== */}
      {sistemasRiego.length > 0 && (
        <TouchableOpacity 
           style={[styles.card, { borderLeftColor: '#0288D1' }]}
           onPress={() => setInfraRiegoExpanded(!infraRiegoExpanded)}
        >
            <View style={[styles.cardHeader, {justifyContent: 'space-between'}]}>
                <View style={{flexDirection:'row', alignItems:'center', gap:10}}>
                   <MaterialCommunityIcons name="water-pump" size={22} color="#0288D1" />
                   <Text style={[styles.cardTitle, { color: '#0288D1' }]}>Infraestructura de Riego</Text>
                </View>
                <MaterialCommunityIcons name={infraRiegoExpanded ? "chevron-up" : "chevron-down"} size={24} color="#666" />
            </View>

            {infraRiegoExpanded && (
              <View style={styles.accordionContent}>
                {sistemasRiego.map((sistema, idx) => (
                    <View key={idx} style={styles.riegoCard}>
                    <View style={styles.riegoHeader}>
                        <MaterialCommunityIcons name="water" size={20} color="#0288D1" />
                        <Text style={styles.riegoNombre}>{sistema.sistema}</Text>
                        <Text style={styles.riegoEficiencia}>{sistema.eficiencia_pct}% eficiente</Text>
                    </View>
                    <View style={styles.riegoDetails}>
                        <Text style={styles.riegoDetail}>💰 Inst: ${sistema.costo_instalacion_ha?.toLocaleString()}/ha</Text>
                        <Text style={styles.riegoDetail}>🔧 Op: ${sistema.costo_operacion_anual?.toLocaleString()}/año</Text>
                        <Text style={styles.riegoDetail}>💧 Lámina: {sistema.lamina_anual_mm} mm/año</Text>
                    </View>
                    </View>
                ))}
              </View>
            )}
        </TouchableOpacity>
      )}

      {/* ==================================================== */}
      {/* 5. COSECHA Y POSTCOSECHA                             */}
      {/* ==================================================== */}
      {Object.keys(postcosecha).length > 0 && (
          <View style={[styles.sectionHeader, {marginTop: 25}]}>
            <MaterialCommunityIcons name="package-variant-closed" size={24} color="#EF6C00" />
            <Text style={styles.sectionHeaderTitle}>Cosecha y Postcosecha</Text>
          </View>
      )}

      {Object.keys(postcosecha).length > 0 && (
        <SectionCard title="Conservación y Calidad" icon="thermometer-alert" color="#EF6C00">
            {/* Grid de Datos Clave */}
            <View style={styles.postcosechaGrid}>
                {postcosecha.temperatura_almacenamiento && (
                    <View style={styles.postBox}>
                        <MaterialCommunityIcons name="snowflake" size={24} color="#0288D1" />
                        <Text style={styles.postLabel}>Temperatura</Text>
                        <Text style={styles.postValue}>{postcosecha.temperatura_almacenamiento}</Text>
                    </View>
                )}
                {postcosecha.humedad_relativa && (
                    <View style={styles.postBox}>
                        <MaterialCommunityIcons name="water-percent" size={24} color="#0097A7" />
                        <Text style={styles.postLabel}>Humedad</Text>
                        <Text style={styles.postValue}>{postcosecha.humedad_relativa}</Text>
                    </View>
                )}
                {postcosecha.vida_anaquel && (
                    <View style={styles.postBox}>
                        <MaterialCommunityIcons name="timer-sand" size={24} color="#F57C00" />
                        <Text style={styles.postLabel}>Vida Útil</Text>
                        <Text style={styles.postValue}>{postcosecha.vida_anaquel}</Text>
                    </View>
                )}
            </View>

            {/* Detalles Texto */}
            {postcosecha.indice_madurez && (
                <View style={styles.postDetailBox}>
                    <Text style={styles.postDetailTitle}>🍎 Índice de Madurez:</Text>
                    <Text style={styles.postDetailText}>{postcosecha.indice_madurez}</Text>
                </View>
            )}
             {postcosecha.manejo_frio && (
                <View style={styles.postDetailBox}>
                    <Text style={styles.postDetailTitle}>❄️ Manejo de Frío:</Text>
                    <Text style={styles.postDetailText}>{postcosecha.manejo_frio}</Text>
                </View>
            )}
        </SectionCard>
      )}

      {/* ==================================================== */}
      {/* 6. CONTROL DE COSTOS (PRESUPUESTO)                   */}
      {/* ==================================================== */}
      <View style={[styles.sectionHeader, {marginTop: 25}]}>
         <MaterialCommunityIcons name="finance" size={24} color="#7B1FA2" />
         <Text style={styles.sectionHeaderTitle}>Control de Costos</Text>
      </View>

      {/* PRESUPUESTO DETALLADO */}
      {Object.keys(presupuestoDetallado).length > 0 ? (
          <TouchableOpacity 
             style={[styles.card, { borderLeftColor: '#7B1FA2' }]} 
             onPress={() => setPresupuestoExpanded(!presupuestoExpanded)}
          >
             <View style={[styles.cardHeader, {justifyContent: 'space-between'}]}>
                <View style={{flexDirection:'row', alignItems:'center', gap:10}}>
                   <MaterialCommunityIcons name="cash-multiple" size={22} color="#7B1FA2" />
                   <Text style={[styles.cardTitle, { color: '#7B1FA2' }]}>Desglose Operativo</Text>
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

      {/* COSTO UNITARIO DE PRODUCCIÓN */}
      {costos.costo_por_kg_produccion && (
        <View style={[styles.card, {backgroundColor: '#E8F5E9', borderLeftColor: '#2E7D32'}]}>
             <View style={styles.row}>
                <Text style={styles.labelBold}>Costo Unitario de Producción:</Text>
                <Text style={[styles.valueText, {fontWeight:'bold', color: '#1B5E20'}]}>${costos.costo_por_kg_produccion} MXN/kg</Text>
             </View>
             <Text style={{fontSize: 11, color: '#666', marginTop: 5, fontStyle: 'italic'}}>
                * Costo directo basado en el plan operativo actual.
             </Text>
        </View>
      )}

    </ScrollView>
  );
}

// --- SUB-COMPONENTES ---

const SectionCard = ({ title, icon, color, children }) => (
  <View style={[styles.card, { borderLeftColor: color }]}>
    <View style={styles.cardHeader}>
      <MaterialCommunityIcons name={icon} size={22} color={color} />
      <Text style={[styles.cardTitle, { color }]}>{title}</Text>
    </View>
    {children}
  </View>
);

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
  
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  mainTitle: { fontSize: 24, fontWeight: "bold", color: "#1B5E20" },
  subHeader: { fontSize: 12, color: '#666', marginTop: 2 },
  
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeCompleto: { backgroundColor: '#4CAF50' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  btnDescargar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1976D2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginLeft: 10 },
  btnDescargarText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2, borderLeftWidth: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  accordionContent: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10 },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  labelBold: { fontWeight: 'bold', color: '#444', fontSize: 13 },
  valueText: { color: '#333', flex: 1, textAlign: 'right', fontSize: 13 },
  
  // Nutrición
  dosisCard: { backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, marginBottom: 5 },
  dosisHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  dosisTitle: { fontSize: 13, fontWeight: 'bold', color: '#8E24AA' },
  
  npkContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  npkBadge: { width: '31%', padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  npkElement: { fontSize: 18, fontWeight: '900' },
  npkValue: { fontSize: 12, fontWeight: 'bold', marginVertical: 2 },
  npkName: { fontSize: 10, color: '#666' },

  microsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  microTag: { backgroundColor: '#F3E5F5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#E1BEE7' },
  microText: { fontSize: 11, color: '#7B1FA2', fontWeight: '600' },

  // Deficiencias
  deficienciasBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFEBEE', padding: 10, borderRadius: 8, marginTop: 15, marginBottom: 5, borderWidth: 1, borderColor: '#FFCDD2' },
  deficienciasTitle: { fontSize: 13, fontWeight: 'bold', color: '#C62828', marginLeft: 8 },
  deficienciasContainer: { marginBottom: 15, backgroundColor: '#FFF5F5', padding: 10, borderRadius: 8 },
  deficienciaItem: { flexDirection: 'row', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#FFEBEE', paddingBottom: 4 },
  defElemento: { fontWeight: 'bold', color: '#B71C1C', width: 80 },
  defSintoma: { fontSize: 13, color: '#555', flex: 1, fontStyle: 'italic' },
  
  subTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 10 },
  subTitleNoMargin: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  
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

  // Postcosecha
  postcosechaGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  postBox: { flex: 1, alignItems: 'center', backgroundColor: '#FFF3E0', marginHorizontal: 4, padding: 10, borderRadius: 8 },
  postLabel: { fontSize: 11, color: '#E65100', marginTop: 4, fontWeight: 'bold' },
  postValue: { fontSize: 13, color: '#333', marginTop: 2, textAlign: 'center', fontWeight:'600' },
  postDetailBox: { marginBottom: 10, backgroundColor: '#FBE9E7', padding: 10, borderRadius: 8 },
  postDetailTitle: { fontSize: 13, fontWeight: 'bold', color: '#D84315', marginBottom: 4 },
  postDetailText: { fontSize: 13, color: '#333', lineHeight: 19 },
  
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
  sectionHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 10 },
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
  
  emptyText: { fontStyle: 'italic', color: '#999', padding: 10, fontSize: 13 },
  emptyContainer: { padding: 30, alignItems: 'center' },
  emptyTextMain: { color: '#999', fontSize: 16, textAlign: 'center', marginTop: 10 },
  
  btnRetry: { backgroundColor: '#2E7D32', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 20 },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  warningCard: { backgroundColor: '#FFEBEE', padding: 15, borderRadius: 10, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#F44336' },
  warningCardText: { color: '#C62828', fontSize: 13, fontWeight: '600' },
});