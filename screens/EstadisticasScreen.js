import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Dimensions, 
  ActivityIndicator, 
  TouchableOpacity, 
  Alert,
  RefreshControl
} from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import CultivoDataManager from '../utils/CultivoDataManager';

const screenWidth = Dimensions.get("window").width;

export default function EstadisticasScreen({ route }) {
  const { cultivo } = route.params; 
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); 
  const [infoCultivo, setInfoCultivo] = useState(null);
  
  const [historicoPrecios, setHistoricoPrecios] = useState(null);
  const [costosData, setCostosData] = useState(null);
  const [rentabilidadData, setRentabilidadData] = useState(null);

  const [statsExpandidas, setStatsExpandidas] = useState(null);
  const [mercadoData, setMercadoData] = useState(null);

  useEffect(() => {
    cargarDatos(false);
  }, [cultivo]);

  const procesarHistoricoPrecios = (data) => {
    const eco = data.economia_expandida || {};
    let precioMax = eco.precio_max_mxn_ton || 0;
    let precioMin = eco.precio_min_mxn_ton || 0;
    let precioProm = eco.precio_promedio_mxn_ton || (precioMax > 0 && precioMin > 0 ? (precioMax + precioMin) / 2 : 0);

    if (precioMax === 0 && precioMin === 0 && precioProm === 0) {
      setHistoricoPrecios(null);
      return;
    }

    if (precioMin === precioMax && precioMax > 0) {
        precioMin = precioMin * 0.98;
        precioMax = precioMax * 1.02;
    }
    if (precioProm === precioMin) precioProm = precioMin * 1.01;

    const labels = ["Mínimo", "Promedio", "Máximo"];
    const valores = [precioMin / 1000, precioProm / 1000, precioMax / 1000];

    setHistoricoPrecios({
      labels,
      datasets: [{ data: valores }]
    });
  };

  const procesarCostos = (data) => {
    const costos = data.costos_produccion_detallados || data.presupuesto_labores_detallado || {};
    const keys = Object.keys(costos);

    if (keys.length === 0) {
        setCostosData(null);
        return;
    }

    const colors = ["#EF5350", "#42A5F5", "#66BB6A", "#FFA726", "#AB47BC", "#26C6DA", "#8D6E63"];
    let chartData = [];

    keys.forEach((key, index) => {
        const valor = costos[key];
        if (typeof valor === 'number' && valor > 0) {
            const nombreFormateado = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            chartData.push({
                name: nombreFormateado,
                population: valor,
                color: colors[index % colors.length],
                legendFontColor: "#7F7F7F",
                legendFontSize: 11
            });
        }
    });

    if (chartData.length === 0) {
        setCostosData(null);
        return;
    }
    setCostosData(chartData);
  };

  const procesarRentabilidad = (data) => {
    const rent = data.analisis_rentabilidad || {};
    
    let inversion = rent.inversion_inicial_ha || 
                      rent.costo_establecimiento_ha || 
                      rent.costo_total_produccion_ha || 0;
    let ingreso = rent.ingreso_anual_esperado_ha || 
                    rent.ingreso_bruto_esperado_ha || 
                    rent.utilidad_neta_esperada_ha || 0;

    if (inversion === 0 && ingreso === 0) {
        setRentabilidadData(null);
        return;
    }

    if (inversion === ingreso && inversion > 0) {
        ingreso = ingreso * 1.01;
    }

    setRentabilidadData({
      labels: ["Inversión", "Ingreso"],
      datasets: [{ data: [inversion, ingreso] }]
    });
  };

  const cargarDatos = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const data = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
      
      if (data) {
        setInfoCultivo(data);
        setStatsExpandidas(data);
        procesarHistoricoPrecios(data);
        procesarCostos(data);
        procesarRentabilidad(data);
        
        if (data.mercado_comercializacion) {
          setMercadoData(data.mercado_comercializacion);
        }
      }
    } catch (error) {
      console.error("Error cargando estadísticas:", error);
      Alert.alert("Error", "No se pudieron procesar los datos estadísticos.");
    } finally {
      if (!isRefreshing) setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await cargarDatos(true);
    setRefreshing(false);
  };

  const obtenerDatosRiesgo = () => {
    if (!infoCultivo) return null;
    const analisis = infoCultivo.analisis_rentabilidad || {};
    const temporadas = infoCultivo.temporadas_precio || {}; 
    
    const volatilidadRaw = analisis.volatilidad_precios || infoCultivo.riesgo || "Media";
    const volString = typeof volatilidadRaw === 'string' ? volatilidadRaw : "Media";
    const volatilidad = volString.charAt(0).toUpperCase() + volString.slice(1);

    let mesesAltosRaw = temporadas.alto || analisis.meses_precio_alto; 
    let mesesBajosRaw = temporadas.bajo || analisis.meses_precio_bajo;

    const mesesAltos = (Array.isArray(mesesAltosRaw) && mesesAltosRaw.length > 0) ? mesesAltosRaw : (mesesAltosRaw ? [mesesAltosRaw] : ["Dic", "Ene"]);
    const mesesBajos = (Array.isArray(mesesBajosRaw) && mesesBajosRaw.length > 0) ? mesesBajosRaw : (mesesBajosRaw ? [mesesBajosRaw] : ["Jun", "Jul"]);

    let colorVol = "#FFA726"; 
    if (volatilidad.toLowerCase().includes('alta')) colorVol = "#EF5350"; 
    if (volatilidad.toLowerCase().includes('baja')) colorVol = "#66BB6A"; 

    return { volatilidad, colorVol, mesesAltos, mesesBajos };
  };

  const datosRiesgo = obtenerDatosRiesgo();

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

    const canalesArray = Array.isArray(canales_venta) ? canales_venta : (canales_venta && typeof canales_venta === 'object' ? Object.values(canales_venta) : []);
    const destinosArray = Array.isArray(destinos_principales) ? destinos_principales : (destinos_principales && typeof destinos_principales === 'object' ? Object.values(destinos_principales) : []);

    const pieDataCanales = canalesArray.map((item, index) => {
        const colors = ['#26A69A', '#66BB6A', '#9CCC65', '#D4E157'];
        const isString = typeof item === 'string';
        return {
            name: isString ? item : (item.canal || 'Otro'),
            population: isString ? 0 : (parseFloat(item.porcentaje || item.participacion_pct) || 0),
            color: colors[index % colors.length],
            legendFontColor: "#333",
            legendFontSize: 12,
            condiciones: isString ? null : item.condiciones_pago
        };
    }).filter(item => item.population > 0);

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
                                    {!!item.condiciones && <Text style={styles.legendSubText}>Pago: {item.condiciones}</Text>}
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
                </>
            )}

            {destinosArray.length > 0 && (
                <>
                <Text style={[styles.subSectionTitle, { marginTop: 20 }]}>Destinos Principales</Text>
                <View style={{ paddingHorizontal: 5 }}>
                    {destinosArray.map((item, index) => {
                        const isString = typeof item === 'string';
                        const nombre = isString ? item.split(' (')[0] : (item.destino || item.ciudad);
                        let porcentaje = isString ? parseFloat(item.match(/\(([^)]+)%\)/)?.[1] || 0) : (parseFloat(item.porcentaje || item.participacion_pct) || 0);
                        if (isNaN(porcentaje)) porcentaje = 0;

                        return (
                            <View key={index} style={styles.destinoItem}>
                                <View style={styles.destinoHeader}>
                                    <Text style={styles.destinoName}>{nombre}</Text>
                                    <Text style={styles.destinoPercent}>{porcentaje}%</Text>
                                </View>
                                <View style={styles.progressBarBackground}>
                                    <View style={[styles.progressBarFill, { width: `${porcentaje}%` }]} />
                                </View>
                            </View>
                        );
                    })}
                </View>
                </>
            )}
        </View>
    );
  };

  const renderHistorialTable = () => {
    if (!statsExpandidas?.historial_produccion) return null;

    const historial = statsExpandidas.historial_produccion;
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
                         {data.rendimiento_t_ha || data.rendimiento_ton_ha || '-'}
                     </Text>
                 </View>
             ))}
         </View>
    );
  };

  const renderProductoresNacionales = () => {
    const detalleObj = statsExpandidas?.detalle_produccion_nacional;
    const listaEstadosRaw = detalleObj?.principales_estados;
    const listaEstados = Array.isArray(listaEstadosRaw) ? listaEstadosRaw : (listaEstadosRaw && typeof listaEstadosRaw === 'object' ? Object.values(listaEstadosRaw) : null);
    
    const listaSimpleFallback = statsExpandidas?.principales_estados; 

    if (!listaEstados && !listaSimpleFallback) return null;

    return (
        <View style={styles.card}>
             <View style={styles.cardHeader}>
                <FontAwesome5 name="map-marked-alt" size={18} color="#00695C" style={{marginRight: 8}}/>
                <Text style={styles.cardTitle}>Top Productores Nacionales</Text>
             </View>
             
             {listaEstados && Array.isArray(listaEstados) ? (
                 <>
                 <View style={styles.statesContainer}>
                     {listaEstados.map((estado, idx) => {
                         const isString = typeof estado === 'string';
                         const nombreEstado = isString ? estado : (estado.estado || 'Desconocido');
                         const participacion = isString ? 0 : (estado.participacion_pct || 0);
                         const superficie = isString ? null : estado.superficie_ha;

                         return (
                             <View key={idx} style={styles.stateRow}>
                                 <View style={styles.stateInfo}>
                                     <Text style={styles.stateRank}>#{idx + 1}</Text>
                                     <Text style={styles.stateName}>{nombreEstado}</Text>
                                 </View>
                                 <View style={styles.stateMetrics}>
                                     <View style={styles.progressBarBg}>
                                         <View style={[styles.progressBarFill, {width: `${participacion}%`}]} />
                                     </View>
                                     {participacion > 0 && <Text style={styles.statePct}>{participacion}%</Text>}
                                     {!!superficie && (
                                         <Text style={styles.stateSurface}>
                                             {superficie.toLocaleString()} ha
                                         </Text>
                                     )}
                                 </View>
                             </View>
                         );
                     })}
                 </View>
                 {!!detalleObj?.estacionalidad && (
                     <Text style={{fontSize:11, color:'#777', marginTop:10, textAlign:'center'}}>
                        Estacionalidad Principal: {detalleObj.estacionalidad}
                     </Text>
                 )}
                 </>
             ) : (
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

  if (loading && !refreshing) {
      return (
          <View style={styles.center}>
              <ActivityIndicator size="large" color="#2E7D32" />
              <Text style={{marginTop: 10, color: '#666'}}>Consultando datos...</Text>
          </View>
      );
  }

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={["#2E7D32", "#1565C0"]} 
          tintColor="#2E7D32" 
        />
      }
    >
      
      <View style={styles.header}>
          <View style={{flex: 1}}>
            <Text style={styles.title}>Estadísticas: {cultivo}</Text>
            {!!statsExpandidas?.panorama_2025_summary?.ranking_mundial && (
                <Text style={styles.subtitleHeader}>
                    Ranking Mundial: #{statsExpandidas.panorama_2025_summary.ranking_mundial}
                </Text>
            )}
          </View>
          
          <TouchableOpacity 
            style={styles.cloudButton} 
            onPress={() => onRefresh()}
          >
              <MaterialCommunityIcons name="cloud-download" size={24} color="#fff" />
              <Text style={styles.cloudButtonText}>Actualizar</Text>
          </TouchableOpacity>
      </View>

      {!!(!statsExpandidas && !loading) && (
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

      {!!(statsExpandidas && ((statsExpandidas.produccion_toneladas || 0) > 0 || (statsExpandidas.superficie_sembrada_ha || 0) > 0)) && (
          <View style={styles.card}>
              <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="tractor" size={20} color="#5D4037" />
                  <Text style={styles.cardTitle}>Producción General (Nacional)</Text>
              </View>
              
              <View style={styles.comercioGrid}>
                  <View style={styles.statBox}>
                      <MaterialCommunityIcons name="weight" size={24} color="#8D6E63" />
                      <Text style={styles.statLabel}>Total</Text>
                      <Text style={styles.statValue}>
                          {statsExpandidas.produccion_toneladas ? statsExpandidas.produccion_toneladas.toLocaleString() : '-'} t
                      </Text>
                  </View>
                  <View style={styles.statBox}>
                      <MaterialCommunityIcons name="texture-box" size={24} color="#4CAF50" />
                      <Text style={styles.statLabel}>Superficie</Text>
                      <Text style={styles.statValue}>
                          {statsExpandidas.superficie_sembrada_ha ? statsExpandidas.superficie_sembrada_ha.toLocaleString() : '-'} ha
                      </Text>
                  </View>
                  <View style={styles.statBox}>
                      <MaterialCommunityIcons name="sprout" size={24} color="#8BC34A" />
                      <Text style={styles.statLabel}>Rendimiento</Text>
                      <Text style={styles.statValue}>
                          {statsExpandidas.rendimiento_ton_ha ? statsExpandidas.rendimiento_ton_ha : '-'} t/ha
                      </Text>
                  </View>
              </View>
          </View>
      )}

      {!!(statsExpandidas?.panorama_2025_summary || statsExpandidas?.comercio_exterior_economia) && (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="earth" size={20} color="#0D47A1" />
                <Text style={styles.cardTitle}>Panorama de Mercado</Text>
            </View>
            
            <View style={styles.panoramaContainer}>
                    {!!(statsExpandidas.panorama_2025_summary?.variacion_anual_pct !== undefined && statsExpandidas.panorama_2025_summary?.variacion_anual_pct !== null) && (
                        <Text style={styles.panoramaText}>
                            <Text style={{fontWeight:'bold'}}>Variación Anual: </Text> 
                            {statsExpandidas.panorama_2025_summary.variacion_anual_pct}%
                        </Text>
                    )}
                 {!!(statsExpandidas.panorama_2025_summary?.resumen || statsExpandidas.comercio_exterior_economia?.consumo_nacional_kg_percapita) && (
                     <Text style={styles.panoramaText}>
                        {statsExpandidas.panorama_2025_summary?.resumen || 
                         `Consumo per cápita: ${statsExpandidas.comercio_exterior_economia?.consumo_nacional_kg_percapita || 'N/A'} kg`}
                    </Text>
                 )}
            </View>

            {!!statsExpandidas.comercio_exterior_economia && (
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
                    
                    <View style={styles.statBox}>
                        <MaterialCommunityIcons name="currency-usd" size={24} color="#2E7D32" />
                        <Text style={styles.statLabel}>Valor</Text>
                        <Text style={styles.statValue}>
                            {(statsExpandidas.comercio_exterior_economia.valor_exportaciones_millones_usd || 
                              statsExpandidas.comercio_exterior_economia.valor_exportacion_mdd || 
                              statsExpandidas.comercio_exterior_economia.exportaciones_millones_usd) 
                                ? `$${(statsExpandidas.comercio_exterior_economia.valor_exportaciones_millones_usd || 
                                       statsExpandidas.comercio_exterior_economia.valor_exportacion_mdd || 
                                       statsExpandidas.comercio_exterior_economia.exportaciones_millones_usd).toLocaleString()} MDD`
                                : 
                                (statsExpandidas.comercio_exterior_economia.valor_produccion_millones_mxn 
                                    ? `$${statsExpandidas.comercio_exterior_economia.valor_produccion_millones_mxn.toLocaleString()} MXN`
                                    : 
                                    (statsExpandidas.valor_produccion_miles_mxn
                                        ? `$${(statsExpandidas.valor_produccion_miles_mxn / 1000).toLocaleString(undefined, {maximumFractionDigits: 1})} MXN`
                                        : '-'))
                            }
                        </Text>
                    </View>

                    <View style={styles.statBox}>
                        <MaterialCommunityIcons name="account-group" size={24} color="#F9A825" />
                        <Text style={styles.statLabel}>Empleos</Text>
                        <Text style={styles.statValue}>
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

      {renderMercadoSection()}

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
                yAxisSuffix="k"
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

      {renderHistorialTable()}
      {renderProductoresNacionales()}

      {!!datosRiesgo && (
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
                            <View key={`alto-${i}`} style={[styles.monthChip, {backgroundColor: '#E8F5E9', borderColor: '#C8E6C9'}]}>
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
                            <View key={`bajo-${i}`} style={[styles.monthChip, {backgroundColor: '#FFEBEE', borderColor: '#FFCDD2'}]}>
                                <Text style={[styles.monthText, {color: '#C62828'}]}>{mes}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>
        </View>
      )}

      {!!costosData && (
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

      {!!rentabilidadData && (
        <View style={[styles.card, {marginBottom: 30}]}>
           <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="finance" size={20} color="#2E7D32" />
              <Text style={styles.cardTitle}>Rentabilidad vs Inversión</Text>
          </View>

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
        </View>
      )}

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