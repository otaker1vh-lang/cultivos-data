import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import CultivoDataManager from '../utils/CultivoDataManager';

const screenWidth = Dimensions.get("window").width;

export default function EstadisticasScreen({ route }) {
  const { cultivo } = route.params; 
  
  const [loading, setLoading] = useState(true);
  const [infoCultivo, setInfoCultivo] = useState(null);
  
  // Estados para gráficas
  const [historicoPrecios, setHistoricoPrecios] = useState(null);
  const [costosData, setCostosData] = useState(null);
  const [rentabilidadData, setRentabilidadData] = useState(null);

  // Estados para datos expandidos
  const [statsExpandidas, setStatsExpandidas] = useState(null);
  const [mercadoData, setMercadoData] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, [cultivo]);

  const cargarDatos = async (manual = false) => {
    try {
        setLoading(true);
        console.log(`🔍 Intentando cargar datos para: ${cultivo} (Manual: ${manual})`);
        
        // Intentamos obtener datos completos. El Manager ya debe manejar la fusión.
        const datos = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
        
        console.log("📦 Datos recibidos:", datos ? "Sí" : "No");

        setInfoCultivo(datos);

        if (datos) {
            // Procesamiento robusto de secciones
            procesarHistoricoPrecios(datos);
            procesarCostos(datos);
            procesarRentabilidad(datos);
            
            if (datos.estadisticas) {
                setStatsExpandidas(datos.estadisticas);
            } else {
                setStatsExpandidas(null);
            }

            if (datos.mercado_comercializacion) {
                setMercadoData(datos.mercado_comercializacion);
            } else {
                setMercadoData(null);
            }

            if (manual) {
                Alert.alert("Actualización", "Datos actualizados correctamente.");
            }
        } else {
            if (manual) Alert.alert("Aviso", "No se encontraron datos para este cultivo.");
        }

    } catch (error) {
        console.error("Error cargando estadísticas:", error);
        if (manual) Alert.alert("Error", "Ocurrió un error al cargar los datos.");
    } finally {
        setLoading(false);
    }
  };

  // --- PROCESAMIENTO DE DATOS ---

  const procesarHistoricoPrecios = (datos) => {
      // CORRECCIÓN: Busca precio en economia_expandida O en la raíz (precio_medio) para evitar gráficas vacías
      const economia = datos.economia_expandida || {};
      const precioProm = parseFloat(economia.precio_promedio_mxn_kg || datos.precio_medio || 15);

      // Simulación de variación estacional basada en el precio base (si no hay datos reales mensuales)
      const preciosMensuales = [
          precioProm * 0.9, precioProm * 0.85, precioProm * 0.9, 
          precioProm * 1.0, precioProm * 1.1, precioProm * 1.2, 
          precioProm * 1.15, precioProm * 1.0, precioProm * 0.95, 
          precioProm * 1.05, precioProm * 1.25, precioProm * 1.3
      ];

      setHistoricoPrecios({
          labels: ["Ene", "Mar", "May", "Jul", "Sep", "Nov"], 
          datasets: [{ data: preciosMensuales }]
      });
  };

  const procesarCostos = (datos) => {
      const presupuesto = datos.presupuesto_labores_detallado || {};
      const categorias = [];
      const colores = ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"];

      let i = 0;
      // Intenta extraer del presupuesto detallado
      if (presupuesto && Object.keys(presupuesto).length > 0) {
        for (const [key, value] of Object.entries(presupuesto)) {
            if (value && value.actividades) {
                const totalCat = value.actividades.reduce((sum, act) => sum + (parseFloat(act.costo_ha) || 0), 0);
                if (totalCat > 0) {
                    categorias.push({
                        name: key.charAt(0).toUpperCase() + key.slice(1),
                        population: totalCat,
                        color: colores[i % colores.length],
                        legendFontColor: "#7F7F7F",
                        legendFontSize: 11
                    });
                    i++;
                }
            }
        }
      }
      
      // Fallback: Si no hay presupuesto detallado, usar costos macro o genéricos
      if (categorias.length === 0 && datos.costos_produccion_detallados) {
         const costosMacro = datos.costos_produccion_detallados;
         if (costosMacro.insumos) categorias.push({ name: 'Insumos', population: parseFloat(costosMacro.insumos) || 15000, color: '#FF6384', legendFontColor: "#7F7F7F", legendFontSize: 11 });
         if (costosMacro.mano_obra) categorias.push({ name: 'Mano de Obra', population: parseFloat(costosMacro.mano_obra) || 12000, color: '#36A2EB', legendFontColor: "#7F7F7F", legendFontSize: 11 });
      }

      setCostosData(categorias.length > 0 ? categorias : null);
  };

  const procesarRentabilidad = (datos) => {
      const rent = datos.analisis_rentabilidad || {};
      // CORRECCIÓN: Buscar ROI en rentabilidad o calcular estimado simple
      const utilidad = parseFloat(rent.utilidad_neta_anual_ha) || (datos.precio_medio * (datos.rendimiento || 10) * 0.3) || 0; 
      const inversion = parseFloat(rent.inversion_inicial_ha) || (utilidad * 0.8) || 0; 

      if (utilidad > 0 || inversion > 0) {
          setRentabilidadData({
              labels: ["Inversión", "Ventas", "Utilidad"],
              datasets: [{
                  data: [
                      inversion,
                      inversion + utilidad, 
                      utilidad
                  ]
              }]
          });
      }
  };

  const obtenerDatosRiesgo = () => {
    if (!infoCultivo) return null;
    const analisis = infoCultivo.analisis_rentabilidad || {};
    // Fallback al riesgo en raiz si no hay analisis detallado
    const volatilidadRaw = analisis.volatilidad_precios || infoCultivo.riesgo || "Media";
    
    // Normalizar texto
    const volatilidad = volatilidadRaw.charAt(0).toUpperCase() + volatilidadRaw.slice(1);

    const mesesAltos = analisis.meses_precio_alto || ["Dic", "Ene"]; 
    const mesesBajos = analisis.meses_precio_bajo || ["Jun", "Jul"]; 

    let colorVol = "#FFA726"; 
    if (volatilidad.toLowerCase().includes('alta')) colorVol = "#EF5350"; 
    if (volatilidad.toLowerCase().includes('baja')) colorVol = "#66BB6A"; 

    return { volatilidad, colorVol, mesesAltos, mesesBajos };
  };

  const datosRiesgo = obtenerDatosRiesgo();

  // --- RENDERIZADO DE SECCIONES ---

  // 1. Mercado y Comercialización
  const renderMercadoSection = () => {
    if (!mercadoData) return (
        <View style={[styles.card, { alignItems: 'center', paddingVertical: 20 }]}>
            <MaterialCommunityIcons name="store-off" size={40} color="#CFD8DC" />
            <Text style={{color: '#90A4AE', marginTop: 10, textAlign:'center'}}>
                Información de comercialización no disponible.
            </Text>
        </View>
    );

    const { canales_venta, destinos_principales } = mercadoData;

    // Normalizar canales para gráfica (si es array de objetos)
    const pieDataCanales = Array.isArray(canales_venta) ? canales_venta.map((item, index) => {
        const colors = ['#26A69A', '#66BB6A', '#9CCC65', '#D4E157'];
        return {
            name: item.canal,
            population: parseFloat(item.porcentaje || item.participacion_pct) || 0,
            color: colors[index % colors.length],
            legendFontColor: "#333",
            legendFontSize: 12,
            condiciones: item.condiciones_pago
        };
    }) : [];

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="store" size={20} color="#00695C" />
                <Text style={styles.cardTitle}>Mercado y Comercialización</Text>
            </View>

            {pieDataCanales.length > 0 && (
                <>
                <Text style={styles.subSectionTitle}>Canales de Venta</Text>
                <View style={{ alignItems: 'center' }}>
                    <PieChart
                        data={pieDataCanales}
                        width={screenWidth - 60}
                        height={200}
                        chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }}
                        accessor={"population"}
                        backgroundColor={"transparent"}
                        paddingLeft={"15"}
                        absolute
                        hasLegend={false} 
                    />
                    <View style={styles.legendContainer}>
                        {pieDataCanales.map((item, index) => (
                            <View key={index} style={styles.legendItem}>
                                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={styles.legendTextBold}>{item.name}</Text>
                                        <Text style={styles.legendTextBold}>{item.population}%</Text>
                                    </View>
                                    {item.condiciones && <Text style={styles.legendSubText}>Pago: {item.condiciones}</Text>}
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
                </>
            )}

            {destinos_principales && Array.isArray(destinos_principales) && (
                <>
                <Text style={[styles.subSectionTitle, { marginTop: 20 }]}>Destinos Principales</Text>
                <View style={{ paddingHorizontal: 5 }}>
                    {destinos_principales.map((item, index) => (
                        <View key={index} style={styles.destinoItem}>
                            <View style={styles.destinoHeader}>
                                <Text style={styles.destinoName}>{item.destino || item.ciudad}</Text>
                                <Text style={styles.destinoPercent}>{item.porcentaje}%</Text>
                            </View>
                            <View style={styles.progressBarBackground}>
                                <View style={[styles.progressBarFill, { width: `${item.porcentaje}%` }]} />
                            </View>
                        </View>
                    ))}
                </View>
                </>
            )}
        </View>
    );
  };

  // 2. Historial de Producción
  const renderHistorialTable = () => {
    if (!statsExpandidas?.historial_produccion) return null;

    const historial = statsExpandidas.historial_produccion;
    // CORRECCIÓN CRÍTICA: Detectar si es Array (tu JSON actual) o Objeto (código original)
    const datosArray = Array.isArray(historial) 
        ? historial 
        : Object.entries(historial).map(([key, val]) => ({ year: key, ...val }));

    if (datosArray.length === 0) return null;

    return (
        <View style={styles.card}>
             <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="history" size={20} color="#5D4037" />
                <Text style={styles.cardTitle}>Historial Productivo</Text>
             </View>
             
             <View style={styles.tableHeader}>
                 <Text style={[styles.th, {flex:1}]}>Año</Text>
                 <Text style={[styles.th, {flex:1, textAlign:'right'}]}>Prod (ton)</Text>
                 <Text style={[styles.th, {flex:1, textAlign:'right'}]}>Rend (t/ha)</Text>
             </View>
             
             {datosArray.map((data, idx) => (
                 <View key={idx} style={[styles.tableRow, idx % 2 !== 0 && styles.tableRowAlt]}>
                     <Text style={[styles.td, {flex:1, fontWeight:'bold'}]}>{data.year}</Text>
                     <Text style={[styles.td, {flex:1, textAlign:'right'}]}>
                         {data.produccion_ton ? data.produccion_ton.toLocaleString() : '-'}
                     </Text>
                     <Text style={[styles.td, {flex:1, textAlign:'right'}]}>
                         {/* Soporta nombres de variable alternativos */}
                         {data.rendimiento_t_ha || data.rendimiento_ton_ha || '-'}
                     </Text>
                 </View>
             ))}
         </View>
    );
  };

  // 3. Producción Nacional (CORREGIDO PARA ESTRUCTURA DE FIREBASE)
  const renderProductoresNacionales = () => {
    const detalleObj = statsExpandidas?.detalle_produccion_nacional;
    // Verificamos si existe el array dentro del objeto (estructura correcta de Firebase)
    const listaEstados = detalleObj?.principales_estados || (Array.isArray(detalleObj) ? detalleObj : null);
    
    // Fallback: Si no hay detalle, buscar lista simple de texto
    const listaSimpleFallback = statsExpandidas?.principales_estados; 

    if (!listaEstados && !listaSimpleFallback) return null;

    return (
        <View style={styles.card}>
             <View style={styles.cardHeader}>
                <FontAwesome5 name="map-marked-alt" size={18} color="#00695C" style={{marginRight: 8}}/>
                <Text style={styles.cardTitle}>Top Productores Nacionales</Text>
             </View>
             
             {/* Opción A: Datos detallados (Barras) */}
             {listaEstados && Array.isArray(listaEstados) ? (
                 <>
                 <View style={styles.statesContainer}>
                     {listaEstados.map((estado, idx) => (
                         <View key={idx} style={styles.stateRow}>
                             <View style={styles.stateInfo}>
                                 <Text style={styles.stateRank}>#{idx + 1}</Text>
                                 <Text style={styles.stateName}>{estado.estado}</Text>
                             </View>
                             <View style={styles.stateMetrics}>
                                 <View style={styles.progressBarBg}>
                                     <View style={[styles.progressBarFill, {width: `${estado.participacion_pct || 0}%`}]} />
                                 </View>
                                 <Text style={styles.statePct}>{estado.participacion_pct || 0}%</Text>
                                 <Text style={styles.stateSurface}>
                                     {estado.superficie_ha ? estado.superficie_ha.toLocaleString() : ''} ha
                                 </Text>
                             </View>
                         </View>
                     ))}
                 </View>
                 {detalleObj?.estacionalidad && (
                     <Text style={{fontSize:11, color:'#777', marginTop:10, textAlign:'center'}}>
                        Estacionalidad Principal: {detalleObj.estacionalidad}
                     </Text>
                 )}
                 </>
             ) : (
                 // Opción B: Lista simple de texto (Fallback)
                 <View style={{padding: 10}}>
                     <Text style={{color: '#555', fontSize: 13, lineHeight: 20}}>
                         Principales estados productores identificados:
                     </Text>
                     <View style={{flexDirection: 'row', flexWrap: 'wrap', marginTop: 8}}>
                         {Array.isArray(listaSimpleFallback) && listaSimpleFallback.map((est, i) => (
                             <View key={i} style={{backgroundColor: '#E0F2F1', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 6}}>
                                 <Text style={{color: '#00695C', fontSize: 12, fontWeight: 'bold'}}>{est}</Text>
                             </View>
                         ))}
                     </View>
                 </View>
             )}
          </View>
    );
  };

  if (loading) {
      return (
          <View style={styles.center}>
              <ActivityIndicator size="large" color="#2E7D32" />
              <Text style={{marginTop: 10, color: '#666'}}>Consultando datos...</Text>
          </View>
      );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      
      {/* HEADER CON BOTÓN DE NUBE */}
      <View style={styles.header}>
          <View style={{flex: 1}}>
            <Text style={styles.title}>Estadísticas: {cultivo}</Text>
            {/* CORRECCIÓN: Acceso seguro a Ranking Mundial */}
            {statsExpandidas?.panorama_2023_summary?.ranking_mundial && (
                <Text style={styles.subtitleHeader}>
                    Ranking Mundial: #{statsExpandidas.panorama_2023_summary.ranking_mundial}
                </Text>
            )}
          </View>
          
          <TouchableOpacity 
            style={styles.cloudButton} 
            onPress={() => cargarDatos(true)}
          >
              <MaterialCommunityIcons name="cloud-download" size={24} color="#fff" />
              <Text style={styles.cloudButtonText}>Actualizar</Text>
          </TouchableOpacity>
      </View>

      {/* AVISO SI NO HAY DATOS EXPANDIDOS */}
      {!statsExpandidas && !loading && (
          <View style={[styles.card, {backgroundColor: '#FFF3E0', borderLeftWidth: 4, borderLeftColor: '#FF9800'}]}>
              <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#F57C00" />
                  <Text style={[styles.cardTitle, {color: '#E65100'}]}>Datos Limitados</Text>
              </View>
              <Text style={{color: '#555', marginBottom: 10}}>
                  Se están mostrando datos básicos locales. Pulsa "Actualizar" para buscar datos detallados en la nube.
              </Text>
          </View>
      )}

      {/* SECCIÓN: PANORAMA (CORREGIDO NOMBRES DE VARIABLES) */}
      {statsExpandidas?.panorama_2023_summary && (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="earth" size={20} color="#0D47A1" />
                <Text style={styles.cardTitle}>Panorama de Mercado</Text>
            </View>
            
            <View style={styles.panoramaContainer}>
                {statsExpandidas.panorama_2023_summary.variacion_anual_pct !== undefined && (
                    <Text style={styles.panoramaText}>
                        <Text style={{fontWeight:'bold'}}>Variación Anual: </Text> 
                        {statsExpandidas.panorama_2023_summary.variacion_anual_pct}%
                    </Text>
                )}
                 <Text style={styles.panoramaText}>
                    {/* Fallback si no hay campo 'resumen' explícito */}
                    {statsExpandidas.panorama_2023_summary.resumen || 
                     `Consumo per cápita: ${statsExpandidas.panorama_2023_summary.consumo_per_capita || 'N/A'}`}
                </Text>
            </View>

            {statsExpandidas.comercio_exterior_economia && (
                <View style={styles.comercioGrid}>
                    <View style={styles.statBox}>
                        <MaterialCommunityIcons name="airplane-takeoff" size={24} color="#1565C0" />
                        <Text style={styles.statLabel}>Exportación</Text>
                        <Text style={styles.statValue}>
                            {statsExpandidas.comercio_exterior_economia.exportaciones_t 
                                ? statsExpandidas.comercio_exterior_economia.exportaciones_t.toLocaleString() 
                                : (statsExpandidas.comercio_exterior_economia.exportacion_ton 
                                    ? statsExpandidas.comercio_exterior_economia.exportacion_ton.toLocaleString() 
                                    : '-')} ton
                        </Text>
                    </View>
                    
                    {/* --- CORRECCIÓN DE VALOR (Soporte MDD y MXN) --- */}
                    <View style={styles.statBox}>
                        <MaterialCommunityIcons name="currency-usd" size={24} color="#2E7D32" />
                        <Text style={styles.statLabel}>Valor</Text>
                        <Text style={styles.statValue}>
                            {/* 1. Intenta buscar valor en Dólares (MDD) con diferentes nombres */}
                            {(statsExpandidas.comercio_exterior_economia.valor_exportaciones_millones_usd || 
                              statsExpandidas.comercio_exterior_economia.valor_exportacion_mdd || 
                              statsExpandidas.comercio_exterior_economia.exportaciones_millones_usd) 
                                ? `$${(statsExpandidas.comercio_exterior_economia.valor_exportaciones_millones_usd || 
                                       statsExpandidas.comercio_exterior_economia.valor_exportacion_mdd || 
                                       statsExpandidas.comercio_exterior_economia.exportaciones_millones_usd).toLocaleString()} MDD`
                                : 
                                // 2. Si no hay MDD, busca valor en Pesos (MXN)
                                (statsExpandidas.comercio_exterior_economia.valor_produccion_millones_mxn 
                                    ? `$${statsExpandidas.comercio_exterior_economia.valor_produccion_millones_mxn.toLocaleString()} MXN`
                                    : '-')
                            }
                        </Text>
                    </View>
                    {/* ----------------------------------------------- */}

                    <View style={styles.statBox}>
                        <MaterialCommunityIcons name="account-group" size={24} color="#F9A825" />
                        <Text style={styles.statLabel}>Empleos</Text>
                        <Text style={styles.statValue}>
                            {/* CORRECCIÓN: Soporte para 'empleos_generados' o suma de directos */}
                            {statsExpandidas.comercio_exterior_economia.empleos_generados
                                ? statsExpandidas.comercio_exterior_economia.empleos_generados.toLocaleString()
                                : (statsExpandidas.comercio_exterior_economia.empleos_directos 
                                    ? statsExpandidas.comercio_exterior_economia.empleos_directos.toLocaleString() 
                                    : '-')}
                        </Text>
                    </View>
                </View>
            )}
        </View>
      )}

      {/* SECCIÓN: MERCADO Y COMERCIALIZACIÓN */}
      {renderMercadoSection()}

      {/* GRÁFICA DE PRECIOS */}
      <View style={styles.card}>
          <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="chart-line" size={20} color="#1565C0" />
              <Text style={styles.cardTitle}>Tendencia de Precios (Estimada)</Text>
          </View>
          
          {historicoPrecios ? (
            <LineChart
                data={historicoPrecios}
                width={screenWidth - 40}
                height={220}
                yAxisLabel="$"
                chartConfig={{
                backgroundColor: "#fff",
                backgroundGradientFrom: "#fff",
                backgroundGradientTo: "#fff",
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(21, 101, 192, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                style: { borderRadius: 16 },
                propsForDots: { r: "4", strokeWidth: "2", stroke: "#1565C0" }
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: 16 }}
            />
          ) : (
              <Text style={styles.noData}>No hay histórico de precios disponible.</Text>
          )}
      </View>

      {/* SECCIÓN: HISTÓRICO DE PRODUCCIÓN */}
      {renderHistorialTable()}

      {/* SECCIÓN: PRODUCCIÓN NACIONAL (CORREGIDA) */}
      {renderProductoresNacionales()}

      {/* ANÁLISIS DE RIESGO */}
      {datosRiesgo && (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="#E65100" />
                <Text style={styles.cardTitle}>Riesgo y Estacionalidad</Text>
            </View>

            <View style={styles.riskRow}>
                <View style={styles.volatilityContainer}>
                    <Text style={styles.riskLabel}>Volatilidad</Text>
                    <View style={[styles.volatilityBadge, { backgroundColor: datosRiesgo.colorVol }]}>
                        <MaterialCommunityIcons name="pulse" size={16} color="#fff" style={{marginRight:4}} />
                        <Text style={styles.volatilityText}>{datosRiesgo.volatilidad}</Text>
                    </View>
                </View>
                
                <View style={{flex: 1, paddingLeft: 10}}>
                     <Text style={styles.riskDesc}>
                        {datosRiesgo.volatilidad.includes('Alta') 
                            ? "Mercado inestable. Se recomienda asegurar precio."
                            : "Precios relativamente estables durante el ciclo."}
                     </Text>
                </View>
            </View>

            <View style={styles.seasonalityContainer}>
                <View style={styles.seasonBox}>
                    <View style={{flexDirection:'row', alignItems:'center', marginBottom: 5}}>
                        <MaterialCommunityIcons name="arrow-up-bold-circle" size={16} color="#2E7D32" />
                        <Text style={[styles.seasonTitle, {color: '#2E7D32'}]}> Precio Alto</Text>
                    </View>
                    <View style={styles.chipsContainer}>
                        {datosRiesgo.mesesAltos.map((mes, i) => (
                            <View key={i} style={[styles.monthChip, {backgroundColor: '#E8F5E9', borderColor: '#C8E6C9'}]}>
                                <Text style={[styles.monthText, {color: '#2E7D32'}]}>{mes}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={styles.seasonBox}>
                    <View style={{flexDirection:'row', alignItems:'center', marginBottom: 5}}>
                        <MaterialCommunityIcons name="arrow-down-bold-circle" size={16} color="#C62828" />
                        <Text style={[styles.seasonTitle, {color: '#C62828'}]}> Precio Bajo</Text>
                    </View>
                     <View style={styles.chipsContainer}>
                        {datosRiesgo.mesesBajos.map((mes, i) => (
                            <View key={i} style={[styles.monthChip, {backgroundColor: '#FFEBEE', borderColor: '#FFCDD2'}]}>
                                <Text style={[styles.monthText, {color: '#C62828'}]}>{mes}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>
        </View>
      )}

      {/* DESGLOSE DE COSTOS */}
      {costosData && (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="pie-chart" size={20} color="#7B1FA2" />
                <Text style={styles.cardTitle}>Estructura de Costos Estimada</Text>
            </View>
            
            <PieChart
                data={costosData}
                width={screenWidth - 40}
                height={200}
                chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }}
                accessor={"population"}
                backgroundColor={"transparent"}
                paddingLeft={"15"}
                absolute
            />
        </View>
      )}

      {/* RENTABILIDAD */}
      <View style={[styles.card, {marginBottom: 30}]}>
           <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="finance" size={20} color="#2E7D32" />
              <Text style={styles.cardTitle}>Rentabilidad vs Inversión</Text>
          </View>

          {rentabilidadData ? (
              <BarChart
                data={rentabilidadData}
                width={screenWidth - 40}
                height={220}
                yAxisLabel="$"
                chartConfig={{
                    backgroundColor: "#fff",
                    backgroundGradientFrom: "#fff",
                    backgroundGradientTo: "#fff",
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(46, 125, 50, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                }}
                style={{ borderRadius: 16 }}
              />
          ) : (
              <Text style={styles.noData}>Datos financieros insuficientes.</Text>
          )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', elevation: 2 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  subtitleHeader: { fontSize: 12, color: '#666', marginTop: 2 },
  
  cloudButton: {
      flexDirection: 'row',
      backgroundColor: '#2E7D32',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      alignItems: 'center',
      elevation: 3
  },
  cloudButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      marginLeft: 6,
      fontSize: 12
  },

  card: { backgroundColor: '#fff', borderRadius: 12, margin: 15, padding: 15, elevation: 3, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#444', marginLeft: 8 },
  noData: { textAlign: 'center', color: '#999', marginVertical: 20, fontStyle: 'italic' },
  subSectionTitle: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 10, marginLeft: 5 },

  riskRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 15 },
  volatilityContainer: { alignItems: 'center', paddingRight: 15, borderRightWidth: 1, borderRightColor: '#eee' },
  riskLabel: { fontSize: 11, color: '#666', marginBottom: 5 },
  volatilityBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  volatilityText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  riskDesc: { fontSize: 12, color: '#555', fontStyle: 'italic', lineHeight: 16 },

  seasonalityContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  seasonBox: { width: '48%', backgroundColor: '#FAFAFA', padding: 10, borderRadius: 8 },
  seasonTitle: { fontSize: 12, fontWeight: 'bold' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  monthChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  monthText: { fontSize: 11, fontWeight: 'bold' },

  panoramaContainer: { marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  panoramaText: { fontSize: 13, color: '#555', marginBottom: 5, lineHeight: 18 },
  comercioGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 11, color: '#777', marginTop: 5 },
  statValue: { fontSize: 12, fontWeight: 'bold', color: '#333', textAlign:'center', marginTop:2 },

  tableHeader: { flexDirection: 'row', backgroundColor: '#EFEBE9', padding: 8, borderRadius: 6, marginBottom: 5 },
  th: { fontSize: 12, fontWeight: 'bold', color: '#5D4037' },
  tableRow: { flexDirection: 'row', padding: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  td: { fontSize: 13, color: '#444' },

  statesContainer: { marginTop: 5 },
  stateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  stateInfo: { flexDirection: 'row', alignItems: 'center', width: '35%' },
  stateRank: { fontWeight: 'bold', color: '#00695C', marginRight: 8, fontSize: 14 },
  stateName: { fontSize: 13, color: '#333' },
  stateMetrics: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  progressBarBg: { width: 60, height: 6, backgroundColor: '#E0F2F1', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#26A69A' },
  statePct: { fontSize: 12, fontWeight: 'bold', color: '#00695C', width: 35, textAlign: 'right' },
  stateSurface: { fontSize: 11, color: '#777', width: 60, textAlign: 'right' },

  legendContainer: { width: '100%', paddingHorizontal: 10, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8, marginTop: 4 },
  legendTextBold: { fontSize: 13, fontWeight: 'bold', color: '#444' },
  legendSubText: { fontSize: 12, color: '#777', fontStyle: 'italic' },

  destinoItem: { marginBottom: 12 },
  destinoHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  destinoName: { fontSize: 14, color: '#333' },
  destinoPercent: { fontSize: 14, fontWeight: 'bold', color: '#2E7D32' },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    flex: 1
  }
});