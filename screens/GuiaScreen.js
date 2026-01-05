import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CultivoDataManager from '../utils/CultivoDataManager';

export default function GuiaScreen({ route }) {
  const { cultivo } = route.params || {};

  const [infoCultivo, setInfoCultivo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nivel, setNivel] = useState('basico');
  const [seccionExpandida, setSeccionExpandida] = useState(null);

  useEffect(() => {
    const cargarDatos = async () => {
      if (cultivo) {
        setLoading(true);
        
        // Cargar datos básicos primero
        const basicos = await CultivoDataManager.obtenerCultivo(cultivo, 'basico');
        setInfoCultivo(basicos);
        setNivel('basico');
        setLoading(false);
        
        // Intentar obtener datos completos
        try {
          const completos = await CultivoDataManager.obtenerCultivo(cultivo, 'completo');
          if (completos && completos._nivel === 'completo') {
            console.log('✅ Datos completos cargados para GuiaScreen');
            console.log('📊 Keys disponibles:', Object.keys(completos));
            
            // 🐛 DEBUG CRÍTICO - Verificar estructura completa
            console.log('🔍 BÚSQUEDA DE guia_errores_comunes:');
            console.log('  - Directamente:', completos.guia_errores_comunes);
            console.log('  - En conclusiones:', completos.conclusiones_recomendaciones?.guia_errores_comunes);
            console.log('  - Errores frecuentes:', completos.errores_frecuentes);
            console.log('  - Alertas riesgos:', completos.alertas_riesgos);
            
            // Imprimir TODO el JSON para análisis
            console.log('📦 ESTRUCTURA COMPLETA:', JSON.stringify(completos, null, 2));
            
            setInfoCultivo(completos);
            setNivel('completo');
          }
        } catch (err) {
          console.log('⚠️ Error cargando datos completos:', err);
          console.log('Usando datos básicos en GuiaScreen');
        }
      }
    };
    cargarDatos();
  }, [cultivo]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={{ marginTop: 10, color: '#666' }}>Cargando datos de {cultivo}...</Text>
      </View>
    );
  }

  if (!infoCultivo) {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="alert-circle-outline" size={50} color="gray" />
        <Text style={styles.errorText}>
          No se encontró información detallada para: {cultivo}
        </Text>
      </View>
    );
  }

  // ------------------------------------------------------------------------
  // EXTRACCIÓN DE DATOS
  // ------------------------------------------------------------------------
  
  const esDatosCompletos = nivel === 'completo';
  
  // 1. Calendarios Regionales
  const calendarios = infoCultivo.calendarios_regionales || [];

  // 2. Tips / Prácticas
  const listaPracticas = infoCultivo.practicas_culturales_clave || infoCultivo.tips_expertos || [];
  const clavesExito = infoCultivo.conclusiones_recomendaciones?.claves_exito || [];

  // 3. MERCADO Y COMERCIALIZACIÓN
  const mercado = infoCultivo.mercado_comercializacion || {};
  const canalesVenta = mercado.canales_venta || [];
  const temporadasPrecio = mercado.temporadas_precio || [];
  const destinosPrincipales = mercado.destinos_principales || [];

  // 4. RECOMENDACIONES CLAVE
  const recomendacionesClave = infoCultivo.recomendaciones_clave || [];

  // 5. Economía expandida
  const economia = infoCultivo.economia_expandida || {};
  const rentabilidad = infoCultivo.analisis_rentabilidad || {};

  // 6. ERRORES COMUNES Y ALERTAS DE RIESGO
  const guiaErroresComunes = infoCultivo.guia_errores_comunes || 
                             infoCultivo.conclusiones_recomendaciones?.guia_errores_comunes ||
                             infoCultivo.errores_frecuentes ||
                             infoCultivo.errores_comunes ||
                             [];
  const alertasRiesgos = infoCultivo.alertas_riesgos || [];

  // 🐛 DEBUG EN CONSOLA
  console.log('📦 Canales de venta encontrados:', canalesVenta.length);
  console.log('💡 Recomendaciones clave encontradas:', recomendacionesClave.length);
  console.log('❌ Errores comunes encontrados:', guiaErroresComunes.length);
  console.log('🚨 Alertas de riesgo encontradas:', alertasRiesgos.length);
  
  if (guiaErroresComunes.length > 0) {
    console.log('📋 Primer error común:', guiaErroresComunes[0]);
  }
  if (alertasRiesgos.length > 0) {
    console.log('📋 Primera alerta de riesgo:', alertasRiesgos[0]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="sprout" size={50} color="#2E7D32" />
        <Text style={styles.title}>{cultivo}</Text>
        <Text style={styles.category}>
          {infoCultivo.categoria ? infoCultivo.categoria.toUpperCase() : 'CULTIVO'}
        </Text>
        <View style={[styles.badge, esDatosCompletos ? styles.badgeCompleto : styles.badgeBasico]}>
          <Text style={styles.badgeText}>
            {esDatosCompletos ? '✓ Completo' : '🔶 Básico'}
          </Text>
        </View>
      </View>

      {/* 🐛 DEBUG BOX - Temporal para verificar datos */}
      {esDatosCompletos && (
        <View style={styles.debugBox}>
          <Text style={styles.debugTitle}>🐛 DEBUG - Datos Cargados</Text>
          <Text style={styles.debugText}>Nivel: {nivel}</Text>
          <Text style={styles.debugText}>Recomendaciones: {recomendacionesClave.length}</Text>
          <Text style={styles.debugText}>Errores comunes: {guiaErroresComunes.length}</Text>
          <Text style={styles.debugText}>Alertas riesgos: {alertasRiesgos.length}</Text>
        </View>
      )}

      {/* SECCIÓN 1: RECOMENDACIONES CLAVE (DESTACADAS) */}
      {esDatosCompletos && recomendacionesClave.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="star" size={24} color="#FFD700" />
            <Text style={styles.sectionTitle}> Recomendaciones Clave</Text>
          </View>

          {recomendacionesClave.map((rec, index) => (
            <View key={`rec-${index}`} style={styles.recomendacionCard}>
              <View style={styles.recomendacionNumber}>
                <Text style={styles.recomendacionNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.recomendacionText}>{rec}</Text>
            </View>
          ))}
        </View>
      )}

      {/* SECCIÓN 2: FECHAS REGIONALES */}
      {calendarios.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="calendar-month" size={24} color="#F57C00" />
            <Text style={styles.sectionTitle}> Fechas Regionales</Text>
          </View>

          {calendarios.map((cal, index) => (
            <View key={`cal-${index}`} style={styles.card}>
              <Text style={styles.regionTitle}>📍 {cal.region}</Text>
              {cal.altitud_msnm && (
                <Text style={styles.altitud}>Altitud: {cal.altitud_msnm} msnm</Text>
              )}
              <View style={styles.row}>
                <Text style={styles.label}>🌱 Siembra:</Text>
                <Text style={styles.value}>
                  {cal.siembra_inicio || 'N/A'} - {cal.siembra_fin || 'N/A'}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>🌾 Cosecha:</Text>
                <Text style={styles.value}>
                  {cal.cosecha_inicio || 'N/A'} - {cal.cosecha_fin || 'N/A'}
                </Text>
              </View>
              {cal.rendimiento_esperado_t_ha && (
                <View style={styles.row}>
                  <Text style={styles.label}>📊 Rendimiento:</Text>
                  <Text style={styles.valueHighlight}>
                    {cal.rendimiento_esperado_t_ha} t/ha
                  </Text>
                </View>
              )}
              {cal.ventana_comercial && (
                <View style={styles.ventanaBox}>
                  <Text style={styles.ventanaText}>💡 {cal.ventana_comercial}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* --- SECCIÓN 1: ERRORES COMUNES A EVITAR --- */}
      {guiaErroresComunes.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="close-octagon" size={24} color="#E91E63" />
            <Text style={styles.sectionTitle}> Errores Comunes a Evitar</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Aprende de los errores más frecuentes para maximizar tu producción
          </Text>

          {guiaErroresComunes.map((item, index) => {
            const errorTexto = item.error || item.titulo || item.descripcion || item;
            const consecuencia = item.consecuencia || item.impacto || '';
            const solucion = item.solucion || item.recomendacion || item.mitigacion || '';
            
            return (
              <View key={`error-${index}`} style={styles.errorComunCard}>
                <View style={styles.errorNumberBadge}>
                  <Text style={styles.errorNumberText}>#{index + 1}</Text>
                </View>
                
                <View style={styles.errorContent}>
                  <View style={styles.errorMainHeader}>
                    <MaterialCommunityIcons name="alert-circle" size={22} color="#E91E63" />
                    <Text style={styles.errorComunTitle}>
                      {typeof errorTexto === 'string' ? errorTexto : JSON.stringify(errorTexto)}
                    </Text>
                  </View>

                  {consecuencia && (
                    <View style={styles.consecuenciaBox}>
                      <Text style={styles.consecuenciaLabel}>⚠️ Consecuencia:</Text>
                      <Text style={styles.consecuenciaText}>{consecuencia}</Text>
                    </View>
                  )}

                  {solucion && (
                    <View style={styles.solucionErrorBox}>
                      <Text style={styles.solucionErrorLabel}>✅ Cómo evitarlo:</Text>
                      <Text style={styles.solucionErrorText}>{solucion}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* --- SECCIÓN 2: ALERTAS DE RIESGO (CLIMÁTICO, FITOSANITARIO, ECONÓMICO) --- */}
      {alertasRiesgos.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="alert-decagram" size={24} color="#D32F2F" />
            <Text style={styles.sectionTitle}> Alertas de Riesgo</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Factores externos que pueden afectar tu producción
          </Text>

          {alertasRiesgos.map((item, index) => {
            const tipoRiesgo = item.tipo || 'General';
            const riesgoTexto = item.riesgo || item.titulo || '';
            const impacto = item.impacto || item.consecuencia || '';
            const mitigacion = item.mitigacion || item.solucion || '';
            const probabilidad = item.probabilidad || '';
            
            const colorPorTipo = {
              'Climático': '#1976D2',
              'Fitosanitario': '#F57C00', 
              'Económico': '#7B1FA2',
              'General': '#D32F2F'
            };
            const colorTipo = colorPorTipo[tipoRiesgo] || '#D32F2F';
            
            const iconoPorTipo = {
              'Climático': 'weather-cloudy-alert',
              'Fitosanitario': 'bug',
              'Económico': 'currency-usd-off',
              'General': 'alert'
            };
            const icono = iconoPorTipo[tipoRiesgo] || 'alert';
            
            return (
              <View key={`riesgo-${index}`} style={styles.riesgoCard}>
                <View style={styles.riesgoTypeHeader}>
                  <View style={[styles.riesgoTypeBadge, {backgroundColor: colorTipo}]}>
                    <MaterialCommunityIcons name={icono} size={16} color="#fff" />
                    <Text style={styles.riesgoTypeText}>{tipoRiesgo}</Text>
                  </View>
                  {probabilidad && (
                    <View style={[styles.probabilidadBadge, {
                      backgroundColor: probabilidad === 'Alta' ? '#FFEBEE' : 
                                      probabilidad === 'Media' ? '#FFF3E0' : '#E8F5E9'
                    }]}>
                      <Text style={[styles.probabilidadText, {
                        color: probabilidad === 'Alta' ? '#D32F2F' : 
                              probabilidad === 'Media' ? '#F57C00' : '#2E7D32'
                      }]}>
                        Probabilidad: {probabilidad}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.riesgoMainContent}>
                  <Text style={styles.riesgoTexto}>{riesgoTexto}</Text>
                </View>

                {impacto && (
                  <View style={styles.impactoBox}>
                    <Text style={styles.impactoLabel}>💥 Impacto potencial:</Text>
                    <Text style={styles.impactoText}>{impacto}</Text>
                  </View>
                )}

                {mitigacion && (
                  <View style={styles.mitigacionBox}>
                    <Text style={styles.mitigacionLabel}>🛡️ Medidas de mitigación:</Text>
                    <Text style={styles.mitigacionText}>{mitigacion}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Mensaje si NO hay ninguno */}
      {esDatosCompletos && guiaErroresComunes.length === 0 && alertasRiesgos.length === 0 && (
        <View style={styles.noDataBox}>
          <MaterialCommunityIcons name="shield-check" size={32} color="#4CAF50" />
          <Text style={styles.noDataText}>
            No se encontraron alertas o errores comunes registrados para este cultivo.
          </Text>
        </View>
      )}

      {/* SECCIÓN 3: MERCADO Y COMERCIALIZACIÓN */}
      {esDatosCompletos && (canalesVenta.length > 0 || temporadasPrecio.length > 0) && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="chart-line" size={24} color="#1976D2" />
            <Text style={styles.sectionTitle}> Mercado y Comercialización</Text>
          </View>

          {/* Canales de Venta */}
          {canalesVenta.length > 0 && (
            <TouchableOpacity 
              style={styles.subsectionCard}
              onPress={() => setSeccionExpandida(seccionExpandida === 'canales' ? null : 'canales')}
            >
              <View style={styles.subsectionHeader}>
                <Text style={styles.subsectionTitle}>🏪 Canales de Venta</Text>
                <MaterialCommunityIcons 
                  name={seccionExpandida === 'canales' ? "chevron-up" : "chevron-down"} 
                  size={22} 
                  color="#666" 
                />
              </View>

              {seccionExpandida === 'canales' && (
                <View style={styles.subsectionContent}>
                  {canalesVenta.map((canal, idx) => (
                    <View key={`canal-${idx}`} style={styles.canalCard}>
                      <View style={styles.canalHeader}>
                        <Text style={styles.canalNombre}>{canal.canal}</Text>
                        <Text style={styles.canalParticipacion}>{canal.participacion_pct}%</Text>
                      </View>
                      <View style={styles.canalDetails}>
                        <Text style={styles.canalPrecio}>
                          💰 ${canal.precio_promedio_kg}/kg
                        </Text>
                        <Text style={styles.canalPago}>
                          📅 Pago: {canal.condiciones_pago}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Temporadas de Precio */}
          {temporadasPrecio.length > 0 && (
            <TouchableOpacity 
              style={styles.subsectionCard}
              onPress={() => setSeccionExpandida(seccionExpandida === 'precios' ? null : 'precios')}
            >
              <View style={styles.subsectionHeader}>
                <Text style={styles.subsectionTitle}>💵 Variación de Precios</Text>
                <MaterialCommunityIcons 
                  name={seccionExpandida === 'precios' ? "chevron-up" : "chevron-down"} 
                  size={22} 
                  color="#666" 
                />
              </View>

              {seccionExpandida === 'precios' && (
                <View style={styles.subsectionContent}>
                  {temporadasPrecio.map((temp, idx) => (
                    <View key={`temp-${idx}`} style={styles.temporadaCard}>
                      <View style={styles.temporadaHeader}>
                        <Text style={styles.temporadaMeses}>{temp.meses}</Text>
                        <View style={[styles.ofertaBadge, {
                          backgroundColor: temp.oferta === 'Alta' ? '#FFEBEE' : 
                                         temp.oferta === 'Media' ? '#FFF3E0' : '#E8F5E9'
                        }]}>
                          <Text style={[styles.ofertaText, {
                            color: temp.oferta === 'Alta' ? '#D32F2F' : 
                                  temp.oferta === 'Media' ? '#F57C00' : '#2E7D32'
                          }]}>
                            {temp.oferta}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.temporadaPrecio}>
                        ${temp.precio_mxn_kg} MXN/kg
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Destinos Principales */}
          {destinosPrincipales.length > 0 && (
            <View style={styles.destinosContainer}>
              <Text style={styles.subsectionTitle}>🗺️ Principales Destinos</Text>
              <View style={styles.destinosGrid}>
                {destinosPrincipales.map((destino, idx) => (
                  <View key={`dest-${idx}`} style={styles.destinoChip}>
                    <Text style={styles.destinoCiudad}>{destino.ciudad}</Text>
                    <Text style={styles.destinoPorcentaje}>{destino.porcentaje}%</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Datos económicos adicionales */}
          {economia.epoca_mejor_precio && (
            <View style={styles.economiaBox}>
              <Text style={styles.economiaLabel}>💡 Mejor época de venta:</Text>
              <Text style={styles.economiaValue}>{economia.epoca_mejor_precio}</Text>
            </View>
          )}
        </View>
      )}

      {/* SECCIÓN 4: RENTABILIDAD */}
      {esDatosCompletos && Object.keys(rentabilidad).length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="currency-usd" size={24} color="#1B5E20" />
            <Text style={styles.sectionTitle}> Análisis de Rentabilidad</Text>
          </View>

          <View style={styles.rentabilidadCard}>
            <View style={styles.rentabilidadRow}>
              <Text style={styles.rentabilidadLabel}>Inversión Inicial</Text>
              <Text style={styles.rentabilidadValue}>
                ${rentabilidad.inversion_inicial_ha?.toLocaleString()}/ha
              </Text>
            </View>
            <View style={styles.rentabilidadRow}>
              <Text style={styles.rentabilidadLabel}>Ingreso Anual Esperado</Text>
              <Text style={styles.rentabilidadValue}>
                ${rentabilidad.ingreso_anual_esperado_ha?.toLocaleString()}/ha
              </Text>
            </View>
            <View style={styles.rentabilidadRow}>
              <Text style={styles.rentabilidadLabel}>Utilidad Neta Anual</Text>
              <Text style={[styles.rentabilidadValue, styles.utilidadPositiva]}>
                ${rentabilidad.utilidad_neta_anual_ha?.toLocaleString()}/ha
              </Text>
            </View>
            <View style={styles.rentabilidadRow}>
              <Text style={styles.rentabilidadLabel}>ROI</Text>
              <Text style={[styles.rentabilidadValue, styles.roiValue]}>
                {rentabilidad.roi_pct}%
              </Text>
            </View>
            <View style={styles.rentabilidadRow}>
              <Text style={styles.rentabilidadLabel}>Años de Recuperación</Text>
              <Text style={styles.rentabilidadValue}>
                {rentabilidad.años_recuperacion} años
              </Text>
            </View>
            {rentabilidad.riesgo && (
              <View style={[styles.riesgoBox, {
                backgroundColor: rentabilidad.riesgo === 'Alto' ? '#FFEBEE' : 
                               rentabilidad.riesgo === 'Medio' ? '#FFF3E0' : '#E8F5E9'
              }]}>
                <Text style={styles.riesgoLabel}>Nivel de Riesgo:</Text>
                <Text style={[styles.riesgoValue, {
                  color: rentabilidad.riesgo === 'Alto' ? '#D32F2F' : 
                        rentabilidad.riesgo === 'Medio' ? '#F57C00' : '#2E7D32'
                }]}>
                  {rentabilidad.riesgo}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* SECCIÓN 5: TIPS Y PRÁCTICAS */}
      {(listaPracticas.length > 0 || clavesExito.length > 0) && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="lightbulb-on" size={24} color="#FFD700" />
            <Text style={styles.sectionTitle}> Tips y Secretos</Text>
          </View>

          {listaPracticas.length > 0 ? (
            listaPracticas.map((item, index) => (
              <View key={`tip-${index}`} style={styles.tipCard}>
                <Text style={styles.tipTitle}>
                  💡 {item.practica || item.titulo || 'Consejo Técnico'}
                </Text>
                <Text style={styles.tipText}>
                  {item.beneficio 
                    ? `${item.beneficio}${item.importancia ? `\n(Importancia: ${item.importancia})` : ''}` 
                    : item.descripcion || item}
                </Text>
              </View>
            ))
          ) : (
            clavesExito.map((clave, index) => (
              <View key={`clave-${index}`} style={styles.tipCard}>
                <Text style={styles.tipTitle}>🔑 Clave de Éxito #{index + 1}</Text>
                <Text style={styles.tipText}>{clave}</Text>
              </View>
            ))
          )}
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#F5F5F5',
    flexGrow: 1,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginTop: 10,
  },
  category: {
    fontSize: 14,
    color: '#666',
    letterSpacing: 2,
    marginTop: 5,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
    marginTop: 10,
  },
  badgeCompleto: { backgroundColor: '#4CAF50' },
  badgeBasico: { backgroundColor: '#FFA726' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  // DEBUG BOX
  debugBox: {
    backgroundColor: '#FFF3E0',
    borderWidth: 2,
    borderColor: '#FF9800',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  debugWarning: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 8,
    fontWeight: 'bold',
  },
  
  // NO DATA BOX
  noDataBox: {
    backgroundColor: '#F5F5F5',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  noDataText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
  noDataHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 5,
    fontStyle: 'italic',
  },
  
  section: {
    marginBottom: 25,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#444',
    marginLeft: 5,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#777',
    marginBottom: 15,
    fontStyle: 'italic',
  },
  
  // Recomendaciones Clave
  recomendacionCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF8E1',
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
    elevation: 2,
  },
  recomendacionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recomendacionNumberText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  recomendacionText: {
    flex: 1,
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  
  // Calendarios
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  regionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 6,
  },
  altitud: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontWeight: '600',
    color: '#555',
    fontSize: 14,
  },
  value: {
    color: '#333',
    fontSize: 14,
  },
  valueHighlight: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: 'bold',
  },
  ventanaBox: {
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  ventanaText: {
    fontSize: 13,
    color: '#2E7D32',
    fontStyle: 'italic',
  },
  
  // Mercado
  subsectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
  },
  subsectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  subsectionContent: {
    marginTop: 12,
  },
  
  canalCard: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#1976D2',
  },
  canalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  canalNombre: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  canalParticipacion: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  canalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  canalPrecio: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
  },
  canalPago: {
    fontSize: 12,
    color: '#666',
  },
  
  temporadaCard: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  temporadaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  temporadaMeses: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  ofertaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ofertaText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  temporadaPrecio: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  
  destinosContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  destinosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  destinoChip: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  destinoCiudad: {
    fontSize: 13,
    color: '#1565C0',
    fontWeight: '600',
  },
  destinoPorcentaje: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: 'bold',
  },
  
  economiaBox: {
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  economiaLabel: {
    fontSize: 13,
    color: '#F57C00',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  economiaValue: {
    fontSize: 14,
    color: '#444',
  },
  
  // Rentabilidad
  rentabilidadCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
  },
  rentabilidadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  rentabilidadLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  rentabilidadValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },
  utilidadPositiva: {
    color: '#2E7D32',
  },
  roiValue: {
    color: '#1976D2',
    fontSize: 16,
  },
  riesgoBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  riesgoLabel: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  riesgoValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  
  // ESTILOS ERRORES COMUNES (Rosa/Magenta)
  errorComunCard: {
    backgroundColor: '#FCE4EC',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    flexDirection: 'row',
    borderLeftWidth: 4,
    borderLeftColor: '#E91E63',
    elevation: 2,
  },
  errorNumberBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E91E63',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  errorNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorContent: {
    flex: 1,
  },
  errorMainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  errorComunTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#880E4F',
    marginLeft: 8,
    flex: 1,
  },
  consecuenciaBox: {
    backgroundColor: '#FFF3E0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF6F00',
  },
  consecuenciaLabel: {
    fontSize: 12,
    color: '#E65100',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  consecuenciaText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  solucionErrorBox: {
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2E7D32',
  },
  solucionErrorLabel: {
    fontSize: 12,
    color: '#1B5E20',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  solucionErrorText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },

  // ESTILOS ALERTAS DE RIESGO (Rojo)
  riesgoCard: {
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
    elevation: 2,
  },
  riesgoTypeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  riesgoTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    gap: 6,
  },
  riesgoTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  probabilidadBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  probabilidadText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  riesgoMainContent: {
    marginBottom: 10,
  },
  riesgoTexto: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#B71C1C',
    lineHeight: 20,
  },
  impactoBox: {
    backgroundColor: '#FFF3E0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  impactoLabel: {
    fontSize: 12,
    color: '#E65100',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  impactoText: {
    fontSize: 13,
    color: '#555',
  },
  mitigacionBox: {
    backgroundColor: '#E3F2FD',
    padding: 10,
    borderRadius: 8,
  },
  mitigacionLabel: {
    fontSize: 12,
    color: '#1565C0',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  mitigacionText: {
    fontSize: 13,
    color: '#333',
  },
  
  // DEPRECADOS (Mantenidos para compatibilidad)
  errorCard: {
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
    elevation: 2,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#B71C1C',
    marginLeft: 6,
    flex: 1,
  },
  errorLabel: {
    fontSize: 12,
    color: '#D32F2F',
    fontWeight: 'bold',
    marginTop: 4,
  },
  errorTextContent: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  solucionBox: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#FFCDD2'
  },
  solucionLabel: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: 'bold',
    marginBottom: 2
  },
  solucionText: {
    fontSize: 13,
    color: '#333',
  },
  
  // Tips
  tipCard: {
    backgroundColor: '#FFFDE7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#FFD700',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tipTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 6,
    color: '#F9A825',
  },
  tipText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 22,
  },
  
  errorText: {
    fontSize: 16,
    color: '#D32F2F',
    marginTop: 10,
    textAlign: 'center',
  },
});