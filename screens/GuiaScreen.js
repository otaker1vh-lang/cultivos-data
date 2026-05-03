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

  const [infoCultivo, setInfoCultivo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); 
  const [nivel, setNivel] = useState('basico');
  const [plagasExpandidas, setPlagasExpandidas] = useState(false); 

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
      } catch (err) {
        console.error('Error cargando datos:', err);
      } finally {
        if (!isRefreshing) setLoading(false);
      }
    }
  };

  useEffect(() => {
    cargarDatos(false);
  }, [cultivo]);

  const safeArray = (data) => {
    if (!data) return [];
    if (typeof data === 'string') return [data];
    const arr = Array.isArray(data) ? data : Object.values(data);
    return arr.filter(Boolean); 
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await cargarDatos(true);
    setRefreshing(false);
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.loadingText}>Analizando estrategia para {cultivo}...</Text>
      </View>
    );
  }

  if (!infoCultivo) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="alert-circle-outline" size={50} color="gray" />
        <Text style={styles.errorText}>Información no disponible.</Text>
      </View>
    );
  }

  const esDatosCompletos = nivel === 'completo';

  const imagenUrl = typeof infoCultivo.imagen_url === 'string' ? infoCultivo.imagen_url.replace(/__/g, '//').replace(/_/g, '/') : null;
  const panoramaUrl = typeof infoCultivo.panorama_url === 'string' ? infoCultivo.panorama_url.replace(/__/g, '//').replace(/_/g, '/') : null;

  const agro = infoCultivo.requerimientos_agroclimaticos || {};
  const sistemasRiego = safeArray(infoCultivo.sistemas_recomendados?.sistemas_riego || infoCultivo.sistemas_riego);
  
  const rentabilidad = infoCultivo.analisis_rentabilidad || {};
  const economia = infoCultivo.economia_expandida || {};
  const precioMin = economia.precio_min_mxn_ton || economia.precio_minimo || economia.precio_min;
  const precioMax = economia.precio_max_mxn_ton || economia.precio_maximo || economia.precio_max;
  
  // 3. MERCADO Y VENTA (Compatibilidad de claves restaurada)
  const mercado = infoCultivo.mercado_comercializacion || infoCultivo.mercado_y_comercializacion || {};
  const canalesVenta = safeArray(mercado.canales_venta);
  let rawDestinos = mercado.destinos_principales || infoCultivo.destinos_principales || [];
  if (!Array.isArray(rawDestinos) && rawDestinos.exportacion) {
      rawDestinos = rawDestinos.exportacion;
  }
  const destinosArray = safeArray(rawDestinos);
  const destinosPrincipales = destinosArray.map(d => typeof d === 'string' ? d : (d.destino || d.pais)).filter(Boolean);
  
  const requisitosExport = safeArray(mercado.certificaciones_requeridas || mercado.requisitos_exportacion);
  const hayDatosExport = requisitosExport.length > 0;

  const recomendaciones = safeArray(infoCultivo.recomendaciones_clave || infoCultivo.recomendaciones);
  const conclusiones = infoCultivo.conclusiones_recomendaciones || {};
  const perspectivas = conclusiones.perspectivas_futuras || conclusiones.tendencia_mercado || null;
  const recomendacionesExtra = !perspectivas ? safeArray(conclusiones) : [];
  const recomendacionesFinales = [...recomendaciones, ...recomendacionesExtra];

  const postcosecha = infoCultivo.postcosecha || null;
  const buenasPracticas = safeArray(infoCultivo.guia_buenas_practicas);

  const formatMoney = (val) => val != null && !isNaN(val) ? Number(val).toLocaleString() : 'N/D';

  const erroresComunes = safeArray(infoCultivo.guia_errores_comunes || infoCultivo.errores_comunes_evitar || infoCultivo.errores_frecuentes);
  const alertas = safeArray(infoCultivo.alertas_riesgos);
  const plagasYEnfermedades = safeArray(infoCultivo.riesgos_detallados);

  return (
    <ScrollView 
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={["#1565C0", "#2E7D32"]} 
          tintColor="#1565C0" 
        />
      }
    >
      
      {/* IMAGEN DE PORTADA */}
      {imagenUrl && (
        <Image 
            source={{ uri: imagenUrl }} 
            style={styles.heroImage} 
            resizeMode="cover" 
        />
      )}

      {/* HEADER ESTRATEGIA */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
            <MaterialCommunityIcons name="strategy" size={40} color="#1565C0" />
            <View style={{marginLeft: 15, flex: 1}}>
                <Text style={styles.title}>{cultivo}</Text>
                <Text style={styles.subtitle}>Visión Estratégica & Negocio</Text>
            </View>
        </View>
        
        <View style={styles.badgesContainer}>
            <View style={[styles.badge, esDatosCompletos ? styles.badgeCompleto : styles.badgeBasico]}>
                <Text style={styles.badgeText}>{esDatosCompletos ? 'Informe Completo' : 'Informe Básico'}</Text>
            </View>
            
            {panoramaUrl && (
                <TouchableOpacity 
                    style={styles.panoramaBtn}
                    onPress={() => Linking.openURL(panoramaUrl).catch(err => console.error("No se pudo abrir", err))}
                >
                    <MaterialCommunityIcons name="file-document-outline" size={14} color="#fff" />
                    <Text style={styles.panoramaBtnText}>Ver Panorama</Text>
                </TouchableOpacity>
            )}
        </View>
      </View>

      {/* --------------------------------------------- */}
      {/* 1. FICHA TÉCNICA (VIABILIDAD)                 */}
      {/* --------------------------------------------- */}
      <View style={styles.section}>
        <SectionHeader icon="check-decagram" title="Viabilidad Técnica" color="#2E7D32" />
        
        <View style={styles.fichaTecnicaCard}>
            <Text style={styles.cardIntro}>Requerimientos mínimos para establecer el cultivo:</Text>
            
            <View style={styles.grid2Col}>
                <InfoItem icon="thermometer" label="Temperatura" value={agro.temperatura || agro.clima_ideal} />
                <InfoItem icon="image-filter-hdr" label="Altitud" value={agro.altitud} />
                <InfoItem icon="water" label="Precipitación" value={agro.precipitacion} />
                <InfoItem icon="flask" label="Suelo / pH" value={`${agro.suelo || agro.tipo_suelo || 'N/D'} (${agro.ph || agro.ph_optimo || agro.rango_ph || 'N/D'})`} />
            </View>
        </View>

        {/* --- TABLA COMPARATIVA DE RIEGO --- */}
        {sistemasRiego && sistemasRiego.length > 0 && (
            <View style={styles.riegoContainer}>
                <Text style={styles.subSectionTitle}>Comparativa de Sistemas de Riego</Text>
                
                <View style={styles.tableCard}>
                    <View style={styles.tableHeader}>
                        <Text style={[styles.th, {flex: 2}]}>Sistema</Text>
                        <Text style={[styles.th, {flex: 1, textAlign:'center'}]}>Efic.</Text>
                        <Text style={[styles.th, {flex: 1.5, textAlign:'right'}]}>Inv./ha</Text>
                        <Text style={[styles.th, {flex: 1.5, textAlign:'right'}]}>Op./año</Text>
                    </View>

                    {sistemasRiego.map((sis, idx) => {
                        const esObjeto = typeof sis === 'object';
                        const nombreSistema = esObjeto ? sis.sistema : sis;
                        const eficiencia = esObjeto ? sis.eficiencia_pct : null;
                        const instalacion = esObjeto ? Number(sis.costo_instalacion_ha) : NaN;
                        const operacion = esObjeto ? Number(sis.costo_operacion_anual) : NaN;
                        const recomendacion = esObjeto ? sis.recomendacion : null;

                        return (
                            <View key={idx} style={styles.tableRowContainer}>
                                <View style={styles.tableRow}>
                                    <Text style={[styles.td, {flex: 2, fontWeight:'bold', color: '#333'}]}>{nombreSistema}</Text>
                                    <Text style={[styles.td, {flex: 1, textAlign:'center'}]}>{eficiencia ? `${eficiencia}%` : 'N/D'}</Text>
                                    <Text style={[styles.td, {flex: 1.5, textAlign:'right', fontSize: 11}]}>
                                        {!isNaN(instalacion) && instalacion > 0 ? `$${(instalacion/1000).toFixed(0)}k` : 'N/D'}
                                    </Text>
                                    <Text style={[styles.td, {flex: 1.5, textAlign:'right', fontSize: 11}]}>
                                        {!isNaN(operacion) && operacion > 0 ? `$${(operacion/1000).toFixed(1)}k` : 'N/D'}
                                    </Text>
                                </View>
                                {recomendacion && (
                                    <View style={styles.recContainer}>
                                        <MaterialCommunityIcons name="information-outline" size={14} color="#0277BD" style={{marginTop: 1}}/>
                                        <Text style={styles.recText}>{recomendacion}</Text>
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>
                <Text style={styles.footnote}>*Inv: Inversión inicial | Op: Costo operación</Text>
            </View>
        )}
      </View>

      {/* --------------------------------------------- */}
      {/* 2. ANÁLISIS DE NEGOCIO                        */}
      {/* --------------------------------------------- */}
      <View style={styles.section}>
        <SectionHeader icon="finance" title="Análisis de Negocio" color="#1565C0" />
        
        {Object.keys(rentabilidad).length > 0 ? (
            <View style={styles.bizCard}>
                <View style={styles.roiHeader}>
                    <Text style={styles.roiTitle}>ROI Estimado</Text>
                    <Text style={styles.roiValue}>{rentabilidad.roi_pct ? `${rentabilidad.roi_pct}%` : 'N/D'}</Text>
                </View>
                
                <View style={styles.bizRow}>
                    <Text style={styles.bizLabel}>Inversión Inicial</Text>
                    <Text style={styles.bizValue}>
                        {rentabilidad.inversion_inicial_ha ? `$${formatMoney(rentabilidad.inversion_inicial_ha)}/ha` : 'N/D'}
                    </Text>
                </View>
                <View style={styles.bizRow}>
                    <Text style={styles.bizLabel}>Utilidad Neta</Text>
                    <Text style={[styles.bizValue, {color: '#2E7D32'}]}>
                        {rentabilidad.utilidad_neta_anual_ha ? `$${formatMoney(rentabilidad.utilidad_neta_anual_ha)}/año` : 'N/D'}
                    </Text>
                </View>
                <View style={styles.bizRow}>
                    <Text style={styles.bizLabel}>Recuperación</Text>
                    <Text style={styles.bizValue}>
                        {rentabilidad.años_recuperacion 
                            ? (String(rentabilidad.años_recuperacion).toLowerCase().includes('año') 
                                ? rentabilidad.años_recuperacion 
                                : `${rentabilidad.años_recuperacion} años`) 
                            : 'N/D'}
                    </Text>
                </View>
            </View>
        ) : (
            <Text style={styles.noDataText}>Datos financieros detallados no disponibles.</Text>
        )}

        {precioMin != null && (
              <View style={styles.priceCard}>
                  <Text style={styles.priceTitle}>Rango de Precios de Mercado (MXN/ton)</Text>
                  <View style={styles.priceRange}>
                      <View style={styles.priceBox}>
                          <Text style={styles.priceLabel}>Mínimo</Text>
                          <Text style={styles.priceNum}>{precioMin != null ? `$${formatMoney(precioMin)}` : 'N/D'}</Text>
                      </View>
                      <View style={styles.priceDivider}>
                          <MaterialCommunityIcons name="arrow-right" size={20} color="#999" />
                      </View>
                      <View style={styles.priceBox}>
                          <Text style={styles.priceLabel}>Máximo</Text>
                          <Text style={styles.priceNum}>${formatMoney(precioMax)}</Text>
                      </View>
                  </View>
                  <Text style={styles.priceNote}>*Precios referenciales de mercado mayorista.</Text>
              </View>
          )}
      </View>

      {/* --------------------------------------------- */}
      {/* SECCIÓN MANEJO POSTCOSECHA                    */}
      {/* --------------------------------------------- */}
      {postcosecha && Object.keys(postcosecha).length > 0 && (
        <View style={styles.section}>
            <SectionHeader icon="package-variant-closed" title="Manejo Postcosecha" color="#E65100" />
            
            <View style={[styles.fichaTecnicaCard, styles.postcosechaCard]}>
                <View style={styles.postcosechaRow}>
                    <View style={styles.postcosechaItem}>
                        <MaterialCommunityIcons name="thermometer" size={20} color="#555" />
                        <Text style={styles.postcosechaLabel}>Temperatura</Text>
                        <Text style={styles.postcosechaValue}>{postcosecha.temperatura_almacen || 'N/A'}</Text>
                    </View>
                    <View style={styles.postcosechaItem}>
                        <MaterialCommunityIcons name="water-percent" size={20} color="#555" />
                        <Text style={styles.postcosechaLabel}>Humedad</Text>
                        <Text style={styles.postcosechaValue}>{postcosecha.humedad_relativa || 'N/A'}</Text>
                    </View>
                    <View style={styles.postcosechaItem}>
                        <MaterialCommunityIcons name="clock-outline" size={20} color="#555" />
                        <Text style={styles.postcosechaLabel}>Vida Útil</Text>
                        <Text style={styles.postcosechaValue}>
                            {postcosecha.vida_util_dias ? `${postcosecha.vida_util_dias} días` : 'N/A'}
                        </Text>
                    </View>
                </View>

                {postcosecha.punto_cosecha && (
                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>🎯 Punto Óptimo de Cosecha</Text>
                        <Text style={styles.infoBoxText}>{postcosecha.punto_cosecha}</Text>
                    </View>
                )}

                {postcosecha.empaque_recomendado && (
                    <View style={[styles.infoBox, { marginTop: 8, backgroundColor: '#FFF3E0' }]}>
                        <Text style={[styles.infoBoxTitle, { color: '#E65100' }]}>📦 Empaque Recomendado</Text>
                        <Text style={[styles.infoBoxText, { color: '#BF360C' }]}>{postcosecha.empaque_recomendado}</Text>
                    </View>
                )}
            </View>
        </View>
      )}

      {/* --------------------------------------------- */}
      {/* 3. MERCADO Y VENTA                            */}
      {/* --------------------------------------------- */}
      {(canalesVenta.length > 0 || destinosPrincipales.length > 0 || hayDatosExport) && (
        <View style={styles.section}>
            <SectionHeader icon="store" title="Mercado Global" color="#F9A825" />
            
            {canalesVenta.length > 0 && (
                <View style={styles.marketContainer}>
                    {canalesVenta.map((canal, idx) => {
                        const esObjeto = typeof canal === 'object';
                        const canalName = esObjeto ? (canal.canal || canal.nombre || canal.tipo || "Canal de venta") : canal;
                        const canalDesc = esObjeto ? canal.condiciones_pago : null;
                        const canalPct = esObjeto ? canal.participacion_pct : null;
                        const canalPrice = esObjeto ? canal.precio_promedio_kg : null;

                        return (
                            <View key={idx} style={styles.canalRow}>
                                <View style={{flex:1}}>
                                    <Text style={styles.canalName}>{canalName}</Text>
                                    {canalDesc && <Text style={styles.canalDesc}>{canalDesc}</Text>}
                                </View>
                                <View style={{alignItems:'flex-end'}}>
                                    <Text style={styles.canalPct}>{canalPct ? `${canalPct}% vol.` : 'N/D'}</Text>
                                    <Text style={styles.canalPrice}>{canalPrice ? `$${formatMoney(canalPrice)}/kg` : 'Varía'}</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            )}

            {hayDatosExport && (
                <View style={styles.exportCard}>
                    <View style={styles.exportHeader}>
                        <MaterialCommunityIcons name="earth" size={20} color="#00695C" />
                        <Text style={styles.exportTitle}>Requisitos de Exportación & Certificaciones</Text>
                    </View>
                    <View style={styles.exportContent}>
                        {requisitosExport.map((req, i) => {
                            const textoReq = typeof req === 'string' ? req : (req.requisito || req.nombre || "Certificación requerida");
                            return (
                                <View key={i} style={styles.reqRow}>
                                    <MaterialCommunityIcons name="check-circle-outline" size={16} color="#00695C" />
                                    <Text style={styles.reqText}>{textoReq}</Text>
                                </View>
                            );
                        })}

                        {destinosPrincipales.length > 0 && (
                            <View style={{marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#B2DFDB'}}>
                                <Text style={styles.destinosLabel}>Destinos Principales:</Text>
                                <Text style={styles.destinosText}>{destinosPrincipales.join(', ')}</Text>
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
      )}

      {/* --------------------------------------------- */}
      {/* 4. INTELIGENCIA (TIPS Y PERSPECTIVAS)         */}
      {/* --------------------------------------------- */}
      {(recomendacionesFinales.length > 0 || perspectivas) && (
          <View style={styles.section}>
            <SectionHeader icon="lightbulb-on" title="Estrategia & Futuro" color="#FF6F00" />
            
            {perspectivas && (
                <View style={styles.trendCard}>
                    <View style={styles.trendHeader}>
                        <MaterialCommunityIcons name="telescope" size={20} color="#4A148C" />
                        <Text style={styles.trendTitle}>Perspectivas del Mercado</Text>
                    </View>
                    <Text style={styles.trendText}>{perspectivas}</Text>
                </View>
            )}
            
            {recomendacionesFinales.length > 0 && (
                <View style={styles.tipsContainer}>
                    <Text style={styles.tipsHeaderTitle}>💡 Recomendaciones Clave:</Text>
                    {recomendacionesFinales.map((rec, i) => (
                        <View key={i} style={styles.tipRow}>
                            <MaterialCommunityIcons name="star" size={18} color="#FF6F00" style={{marginTop:2}} />
                            <Text style={styles.tipText}>{rec}</Text>
                        </View>
                    ))}
                </View>
            )}
          </View>
      )}

      {/* --------------------------------------------- */}
      {/* 5. BUENAS PRÁCTICAS                           */}
      {/* --------------------------------------------- */}
      {buenasPracticas.length > 0 && (
          <View style={styles.section}>
              <SectionHeader icon="clipboard-check" title="Buenas Prácticas" color="#009688" />
              
              {buenasPracticas.map((item, index) => {
                  const esObjeto = typeof item === 'object';
                  const tituloPractica = esObjeto ? (item.practica || item.titulo || item.nombre || "Práctica Recomendada") : item;
                  
                  return (
                      <View key={index} style={styles.practicaCard}>
                          {/* Renderizado de la Práctica */}
                          <View style={styles.practicaHeader}>
                              <MaterialCommunityIcons name="check-circle" size={20} color="#009688" />
                              <Text style={styles.practicaTitle}>Practica: "{tituloPractica}"</Text>
                          </View>
                          
                          {/* Renderizado de la Importancia */}
                          {esObjeto && item.importancia && (
                              <View style={styles.practicaBadgeRow}>
                                  <Text style={styles.practicaLabel}>Importancia: </Text>
                                  <View style={styles.badgeImportancia}>
                                      <Text style={styles.badgeImportanciaText}>{item.importancia}</Text>
                                  </View>
                              </View>
                          )}
                          
                          {/* Renderizado del Beneficio */}
                          {esObjeto && item.beneficio && (
                              <View style={styles.beneficioBox}>
                                  <MaterialCommunityIcons name="star-shooting" size={18} color="#2E7D32" style={{marginTop: 1}}/>
                                  <Text style={styles.beneficioText}>Beneficio: "{item.beneficio}"</Text>
                              </View>
                          )}
                      </View>
                  );
              })}
          </View>
      )}

      {/* --------------------------------------------- */}
      {/* 6. ERRORES COMUNES (DETALLADO)                */}
      {/* --------------------------------------------- */}
      {erroresComunes.length > 0 && (
          <View style={styles.section}>
              <SectionHeader icon="alert-octagon" title="Errores Comunes" color="#D32F2F" />
              
              {erroresComunes.map((item, idx) => {
                  const esObjeto = typeof item === 'object';
                  const titulo = esObjeto ? (item.error || item.titulo || item.problema || "Error común") : item;
                  const consecuencia = esObjeto ? item.consecuencia : null;
                  const solucion = esObjeto ? item.solucion : null;
              
                  return (
                      <View key={idx} style={styles.errorFullCard}>
                          {/* Renderizado del Error */}
                          <View style={styles.errorHeader}>
                              <MaterialCommunityIcons name="alert-octagon-outline" size={22} color="#D32F2F" />
                              <Text style={styles.errorTitle}>Error: "{titulo}"</Text>
                          </View>
                  
                          {/* Renderizado de la Solución (Prioridad Visual) */}
                          {solucion && (
                              <View style={[styles.errorSection, styles.solutionSection]}>
                                  <View style={styles.rowLabel}>
                                      <MaterialCommunityIcons name="shield-check" size={16} color="#2E7D32" />
                                      <Text style={[styles.errorLabel, {color: '#2E7D32'}]}>Solucion:</Text>
                                  </View>
                                  <Text style={[styles.errorText, {color: '#1B5E20'}]}>"{solucion}"</Text>
                              </View>
                          )}
      
                          {/* Renderizado de la Consecuencia */}
                          {consecuencia && (
                              <View style={styles.errorSection}>
                                  <View style={styles.rowLabel}>
                                      <MaterialCommunityIcons name="lightning-bolt" size={16} color="#E65100" />
                                      <Text style={[styles.errorLabel, {color: '#E65100'}]}>Consecuencia:</Text>
                                  </View>
                                  <Text style={styles.errorText}>"{consecuencia}"</Text>
                              </View>
                          )}
                      </View>
                  );
              })}
          </View>
      )}

      {/* --------------------------------------------- */}
      {/* FITOSANIDAD (PLAGAS Y ENFERMEDADES)           */}
      {/* --------------------------------------------- */}
      {plagasYEnfermedades.length > 0 && (
          <View style={styles.section}>
              <TouchableOpacity 
                  style={styles.collapsibleHeader} 
                  activeOpacity={0.7} 
                  onPress={() => setPlagasExpandidas(!plagasExpandidas)}
              >
                  <View style={styles.collapsibleHeaderInner}>
                      <MaterialCommunityIcons name="bug" size={22} color="#7B1FA2" />
                      <Text style={[styles.sectionTitle, { color: '#7B1FA2', marginLeft: 8 }]}>Sanidad y Control</Text>
                  </View>
                  <MaterialCommunityIcons 
                      name={plagasExpandidas ? "chevron-up" : "chevron-down"} 
                      size={24} 
                      color="#7B1FA2" 
                  />
              </TouchableOpacity>
              
              {plagasExpandidas && (
                  <View style={styles.collapsibleContent}>
                      {plagasYEnfermedades.map((plaga, idx) => {
                          const esObjeto = typeof plaga === 'object';
                          const nombrePlaga = esObjeto ? (plaga.nombre_plaga || plaga.nombre_cientifico || 'Problema Fitosanitario') : plaga;
                          const descripcion = esObjeto ? (plaga.descripcion || plaga.tipo) : null;
                          const control = esObjeto ? (plaga.control_recomendado || plaga.control_biologico) : null;

                          return (
                              <View key={`plaga-${idx}`} style={[styles.sanidadCard, {borderLeftColor: '#7B1FA2'}]}>
                                  <View style={styles.practicaHeader}>
                                      <MaterialCommunityIcons name="virus-outline" size={20} color="#7B1FA2" />
                                      <Text style={[styles.practicaTitle, {color: '#7B1FA2'}]}>
                                          {nombrePlaga}
                                      </Text>
                                  </View>
                                  
                                  {descripcion && <Text style={[styles.practicaLabel, {marginBottom: 4}]}>{descripcion}</Text>}
                                  
                                  {control && (
                                      <View style={{marginTop: 6, backgroundColor: '#F3E5F5', padding: 8, borderRadius: 6}}>
                                          <Text style={{fontSize: 11, fontWeight: 'bold', color: '#4A148C', marginBottom: 2}}>
                                              Estrategia de Control:
                                          </Text>
                                          <Text style={{fontSize: 12, color: '#333'}}>
                                              {control}
                                          </Text>
                                      </View>
                                  )}
                              </View>
                          );
                      })}
                  </View>
              )}
          </View>
      )}

      {/* --------------------------------------------- */}
      {/* 7. ALERTAS GENERALES (RIESGOS)                */}
      {/* --------------------------------------------- */}
      {alertas.length > 0 && (
          <View style={styles.section}>
             <SectionHeader icon="shield-alert" title="Alertas de Riesgo" color="#F57C00" />
             
             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight: 20}}>
                {alertas.map((alerta, idx) => {
                    const esObjeto = typeof alerta === 'object';
                    const texto = esObjeto ? (alerta.riesgo || alerta.titulo || alerta.tipo || 'Riesgo General') : alerta;
                    const impacto = esObjeto ? alerta.impacto : null;
                    const tipo = esObjeto ? (alerta.tipo || 'Alerta') : 'Alerta';

                    return (
                        <View key={`alert-${idx}`} style={styles.riskCard}>
                             <View style={styles.riskHeader}>
                                <MaterialCommunityIcons name="alert" size={20} color="#F57C00" />
                                <Text style={[styles.riskType, {color: '#F57C00'}]}>{tipo}</Text>
                            </View>
                            <Text style={styles.riskText} numberOfLines={3}>{texto}</Text>
                            {impacto ? <Text style={styles.riskImpact}>{impacto}</Text> : null}
                        </View>
                    )
                })}
             </ScrollView>
          </View>
      )}

    </ScrollView>
  );
}

// Subcomponentes para limpieza
const SectionHeader = ({ icon, title, color }) => (
    <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name={icon} size={22} color={color} />
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
    </View>
);

const InfoItem = ({ icon, label, value }) => {
    if(!value) return null;
    return (
        <View style={styles.infoItem}>
            <MaterialCommunityIcons name={icon} size={16} color="#666" />
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
  container: { backgroundColor: '#F5F7FA', flexGrow: 1, paddingBottom: 40 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666' },
  errorText: { marginTop: 10, color: '#D32F2F', fontSize: 16 },
  noDataText: { fontStyle: 'italic', color: '#999', margin: 10 },

  // PORTADA
  heroImage: { width: '100%', height: 180 },

  // HEADER
  header: { backgroundColor: '#fff', padding: 20, paddingBottom: 15, marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  headerTop: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 14, color: '#666' },
  
  badgesContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeCompleto: { backgroundColor: '#E8F5E9' },
  badgeBasico: { backgroundColor: '#FFF3E0' },
  badgeText: { fontSize: 11, fontWeight: 'bold', color: '#2E7D32' },
  
  panoramaBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1565C0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, gap: 4 },
  panoramaBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  section: { marginBottom: 20, paddingHorizontal: 15 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold' },

  // FICHA TÉCNICA
  fichaTecnicaCard: { backgroundColor: '#fff', borderRadius: 12, padding: 15, elevation: 2 },
  cardIntro: { fontSize: 13, color: '#666', marginBottom: 12, fontStyle:'italic' },
  grid2Col: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoItem: { width: '48%', backgroundColor: '#F5F5F5', padding: 10, borderRadius: 8 },
  infoLabel: { fontSize: 11, color: '#888', marginTop: 4 },
  infoValue: { fontSize: 13, fontWeight: 'bold', color: '#333' },

  // --- ESTILOS TABLA RIEGO ---
  riegoContainer: { marginTop: 15 },
  subSectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#2E7D32', marginBottom: 8, marginLeft: 5 },
  tableCard: { backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E0E0' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#E8F5E9', paddingVertical: 10, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: '#C8E6C9' },
  th: { fontSize: 11, fontWeight: 'bold', color: '#1B5E20' },
  tableRowContainer: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 5 },
  td: { fontSize: 12, color: '#444' },
  recContainer: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8, paddingBottom: 8, gap: 5 },
  recText: { fontSize: 11, color: '#0277BD', fontStyle: 'italic', flex: 1 },
  footnote: { fontSize: 10, color: '#888', fontStyle: 'italic', marginTop: 5, textAlign: 'right' },

  // NEGOCIO
  bizCard: { backgroundColor: '#fff', borderRadius: 12, padding: 15, elevation: 3, borderTopWidth: 4, borderTopColor: '#1565C0' },
  roiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  roiTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  roiValue: { fontSize: 24, fontWeight: '900', color: '#1565C0' },
  bizRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bizLabel: { fontSize: 13, color: '#666' },
  bizValue: { fontSize: 13, fontWeight: 'bold', color: '#333' },

  // PRECIOS
  priceCard: { marginTop: 10, backgroundColor: '#E3F2FD', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#BBDEFB' },
  priceTitle: { fontSize: 12, color: '#1565C0', fontWeight: 'bold', marginBottom: 8, textAlign:'center' },
  priceRange: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceBox: { alignItems: 'center', flex: 1 },
  priceDivider: { paddingHorizontal: 10 },
  priceLabel: { fontSize: 10, color: '#555' },
  priceNum: { fontSize: 16, fontWeight: 'bold', color: '#0D47A1' },
  priceNote: { fontSize: 10, color: '#777', marginTop: 8, textAlign:'center', fontStyle:'italic' },

  // ESTILOS POSTCOSECHA
  postcosechaCard: { borderLeftWidth: 4, borderLeftColor: '#E65100' },
  postcosechaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, backgroundColor: '#FAFAFA', padding: 10, borderRadius: 8 },
  postcosechaItem: { alignItems: 'center', flex: 1 },
  postcosechaLabel: { fontSize: 11, color: '#777', marginTop: 4 },
  postcosechaValue: { fontSize: 13, fontWeight: 'bold', color: '#333', marginTop: 2, textAlign: 'center' },
  infoBox: { backgroundColor: '#E8F5E9', padding: 10, borderRadius: 6 },
  infoBoxTitle: { fontSize: 12, fontWeight: 'bold', color: '#2E7D32', marginBottom: 4 },
  infoBoxText: { fontSize: 13, color: '#1B5E20', lineHeight: 18 },

  // MERCADO
  marketContainer: { backgroundColor: '#fff', borderRadius: 12, padding: 5, overflow: 'hidden' },
  canalRow: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  canalName: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  canalDesc: { fontSize: 11, color: '#888' },
  canalPct: { fontSize: 12, fontWeight: 'bold', color: '#F9A825' },
  canalPrice: { fontSize: 12, color: '#2E7D32' },

  // ESTILOS EXPORTACION
  exportCard: { marginTop: 10, backgroundColor: '#E0F2F1', borderRadius: 12, padding: 15, borderLeftWidth: 4, borderLeftColor: '#00695C' },
  exportHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  exportTitle: { fontSize: 14, fontWeight: 'bold', color: '#00695C' },
  reqRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 6 },
  reqText: { fontSize: 13, color: '#004D40', flex: 1 },
  destinosLabel: { fontSize: 12, fontWeight: 'bold', color: '#00796B' },
  destinosText: { fontSize: 12, color: '#004D40', fontStyle: 'italic' },

  // ESTRATEGIA Y FUTURO
  trendCard: { backgroundColor: '#F3E5F5', padding: 15, borderRadius: 12, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#7B1FA2' },
  trendHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  trendTitle: { fontSize: 14, fontWeight: 'bold', color: '#4A148C' },
  trendText: { fontSize: 13, color: '#4A148C', lineHeight: 19 },

  // TIPS (RECOMENDACIONES)
  tipsContainer: { backgroundColor: '#FFF8E1', borderRadius: 12, padding: 15 },
  tipsHeaderTitle: { fontSize: 14, fontWeight: 'bold', color: '#F57C00', marginBottom: 10 },
  tipRow: { flexDirection: 'row', marginBottom: 10, gap: 10 },
  tipText: { fontSize: 13, color: '#444', lineHeight: 20, flex: 1 },

  // BUENAS PRÁCTICAS (NUEVO ORDEN Y DISEÑO)
  practicaCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#009688', elevation: 2 },
  practicaHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  practicaTitle: { fontSize: 15, fontWeight: 'bold', color: '#00796B', flex: 1, marginTop: -1 },
  practicaBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 5 },
  practicaLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  badgeImportancia: { backgroundColor: '#E0F2F1', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeImportanciaText: { fontSize: 11, fontWeight: 'bold', color: '#00695C', textTransform: 'uppercase' },
  beneficioBox: { flexDirection: 'row', backgroundColor: '#E8F5E9', padding: 8, borderRadius: 8, alignItems: 'flex-start', gap: 6 },
  beneficioText: { fontSize: 13, color: '#1B5E20', flex: 1, fontWeight: '500' },

  // ERRORES COMUNES (NUEVO ORDEN Y DISEÑO)
  errorFullCard: { backgroundColor: '#fff', borderRadius: 10, padding: 15, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#D32F2F', elevation: 2 },
  errorHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  errorTitle: { fontSize: 15, fontWeight: 'bold', color: '#C62828', flex: 1, marginTop: -2 },
  errorSection: { marginBottom: 10 },
  rowLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 4 },
  errorLabel: { fontSize: 13, fontWeight: 'bold' },
  errorText: { fontSize: 13, color: '#444', lineHeight: 18, paddingLeft: 20 },
  solutionSection: { backgroundColor: '#F1F8E9', padding: 10, borderRadius: 8, marginBottom: 0, borderWidth: 1, borderColor: '#C8E6C9' },

  // FITOSANIDAD
  sanidadCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 3, elevation: 1 },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F3E5F5', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 10, marginBottom: 10 },
  collapsibleHeaderInner: { flexDirection: 'row', alignItems: 'center' },
  collapsibleContent: { marginTop: 5 },

  // RIESGOS (Scroll Horizontal)
  riskCard: { width: 200, backgroundColor: '#fff', padding: 12, borderRadius: 10, marginRight: 10, borderLeftWidth: 4, borderLeftColor: '#F57C00', elevation: 2, height: 130 },
  riskHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 5 },
  riskType: { fontSize: 12, fontWeight: 'bold', color: '#F57C00' },
  riskText: { fontSize: 12, color: '#555', marginBottom: 4 },
  riskImpact: { fontSize: 11, color: '#E65100', fontStyle: 'italic', marginTop: 'auto' },
});