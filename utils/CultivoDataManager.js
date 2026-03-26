import AsyncStorage from '@react-native-async-storage/async-storage';
import datosBasicosLocal from '../data/cultivos_basico.json'; 

const FIREBASE_URL = "https://cultivos-d97e2-default-rtdb.firebaseio.com";

class CultivoDataManager {

  _isFirebaseMutatedArray(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    const allNumbers = keys.every(key => !isNaN(key) && Number.isInteger(parseFloat(key)) && parseInt(key) >= 0);
    if (!allNumbers) return false;
    const maxIndex = Math.max(...keys.map(k => parseInt(k)));
    return maxIndex < 1900;
  }

  _normalizarLista(data) {
    if (data === null || data === undefined) return [];
    if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') return [data];
    if (Array.isArray(data)) return data.filter(item => item !== null && item !== undefined);
    
    if (typeof data === 'object') {
        if (this._isFirebaseMutatedArray(data)) {
            return Object.values(data).filter(item => item !== null && item !== undefined);
        }
        return [data]; 
    }
    return [];
  }

  _isStrictObject(obj) {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj) && !this._isFirebaseMutatedArray(obj);
  }

  /**
   * ESCUDO MATEMÁTICO: Previene NaN que crashean RN Chart Kit y GanttFenologico
   */
  _safeFloat(val, fallback = 0) {
      if (val === null || val === undefined || val === '') return fallback;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? fallback : parsed;
  }

  _normalizarDiccionarioRiesgosAArray(riesgosData, tipoPorDefecto = 'Riesgo') {
    if (!riesgosData) return [];
    if (Array.isArray(riesgosData)) return riesgosData.filter(Boolean).map(r => typeof r === 'object' ? r : { nombre_plaga: String(r), tipo: tipoPorDefecto });

    if (typeof riesgosData === 'object') {
        if (this._isFirebaseMutatedArray(riesgosData)) {
            return Object.values(riesgosData).filter(Boolean).map(r => typeof r === 'object' ? r : { nombre_plaga: String(r), tipo: tipoPorDefecto });
        }
        return Object.entries(riesgosData).map(([nombre, detalles]) => {
            if (typeof detalles !== 'object' || detalles === null || Array.isArray(detalles)) {
                return { nombre_plaga: nombre, descripcion: Array.isArray(detalles) ? detalles.join(', ') : String(detalles), tipo: tipoPorDefecto };
            }
            return { nombre_plaga: nombre, ...detalles, tipo: detalles.tipo || tipoPorDefecto };
        });
    }
    return [];
  }

  _validarDatosMinimos(data) {
    return !!(data && data._nivel);
  }

  /**
   * SANITIZADOR MAESTRO - BLINDAJE MATEMÁTICO Y ESTRUCTURAL
   */
  _prepararEstructura(data) {
    try {
      if (!data) return null;
      let estructurado = { ...data };

      // ==========================================
      // 0. LIMPIEZA DE ARREGLOS Y DICCIONARIOS BASE
      // ==========================================
      const arrayFields = ['buenas_practicas_destacadas', 'conclusiones_recomendaciones', 'errores_comunes_evitar', 'guia_buenas_practicas', 'guia_errores_comunes', 'recomendaciones_clave'];
      arrayFields.forEach(field => {
        if (estructurado[field]) {
          let normalizada = this._normalizarLista(estructurado[field]);
          if (field === 'conclusiones_recomendaciones' || field === 'errores_comunes_evitar') {
             normalizada = normalizada.map(item => typeof item === 'string' ? item : JSON.stringify(item));
          }
          estructurado[field] = normalizada;
        } else estructurado[field] = [];
      });

      const dictFields = ['labores', 'labores_culturales', 'deficiencias_nutricionales', 'costos_produccion_detallados', 'presupuesto_labores_detallado', 'requerimientos_agroclimaticos', 'postcosecha', 'comercio_exterior_economia', 'economia_expandida'];
      dictFields.forEach(field => {
          if (estructurado[field] && this._isStrictObject(estructurado[field])) {
              if (field === 'labores' || field === 'labores_culturales') {
                  Object.keys(estructurado[field]).forEach(key => {
                      estructurado[field][key] = this._normalizarLista(estructurado[field][key]);
                  });
              }
              // CASTEO AGRESIVO: Evita que los costos lleguen como strings a la gráfica PieChart
              if (field === 'costos_produccion_detallados' || field === 'presupuesto_labores_detallado') {
                  Object.keys(estructurado[field]).forEach(key => {
                      estructurado[field][key] = this._safeFloat(estructurado[field][key]);
                  });
              }
          } else {
              estructurado[field] = {}; 
          }
      });

      // Asegurar variables maestras numéricas 
      estructurado.produccion_toneladas = this._safeFloat(estructurado.produccion_toneladas || estructurado.produccion_nacional_t);
      estructurado.superficie_sembrada_ha = this._safeFloat(estructurado.superficie_sembrada_ha || estructurado.superficie_nacional_ha);
      estructurado.rendimiento_ton_ha = this._safeFloat(estructurado.rendimiento_ton_ha || estructurado.rendimiento_promedio_t_ha);
      estructurado.valor_produccion_miles_mxn = this._safeFloat(estructurado.valor_produccion_miles_mxn);

      // ==========================================
      // 1. FENOLOGÍA Y CALENDARIOS (FenologiaScreen)
      // ==========================================
      if (!estructurado.ciclo_fenologico) {
          estructurado.ciclo_fenologico = { etapas: [], fechas_por_estado: [], variedades_principales: [] };
      } else {
          let diasAcumulados = 0;
          estructurado.ciclo_fenologico.etapas = this._normalizarLista(estructurado.ciclo_fenologico.etapas).map(e => {
              if (typeof e !== 'object') return { nombre: String(e), inicio_dias: diasAcumulados, duracion_dias: 10 };
              
              // Evita división por cero (NaN%) en anchos de barra Gantt
              const duracion = this._safeFloat(e.duracion_dias || e.duracion, 10) || 1; 
              const inicio = (e.inicio_dias !== undefined && e.inicio_dias !== null) ? this._safeFloat(e.inicio_dias, 0) : diasAcumulados;
              diasAcumulados = inicio + duracion;
              
              return { ...e, inicio_dias: inicio, duracion_dias: duracion, nombre: String(e.nombre || e.fase || e.bbch_fase || "Fase") };
          });
          
          estructurado.ciclo_fenologico.fechas_por_estado = this._normalizarLista(estructurado.ciclo_fenologico.fechas_por_estado);
          estructurado.ciclo_fenologico.variedades_principales = this._normalizarLista(estructurado.ciclo_fenologico.variedades_principales);
      }

      if (estructurado.bbch_detallado) {
          estructurado.bbch_detallado = this._normalizarLista(estructurado.bbch_detallado).map(fase => {
              if (typeof fase !== 'object') return { nombre_fase: String(fase), codigo_bbch: "", actividades_criticas: [] };
              return { 
                  ...fase, 
                  nombre_fase: String(fase.nombre_fase || fase.fase_original || fase.nombre || fase.fase || "Fase"),
                  codigo_bbch: String(fase.codigo_bbch || fase.bbch_fase || ""),
                  actividades_criticas: this._normalizarLista(fase.actividades_criticas) 
              };
          });
      } else {
          estructurado.bbch_detallado = [];
      }
      
      const normalizarCalendario = (cal) => {
          let arr = [];
          if (!cal) return [];
          if (Array.isArray(cal)) arr = cal.filter(Boolean);
          else if (this._isFirebaseMutatedArray(cal)) arr = Object.values(cal).filter(Boolean);
          else if (typeof cal === 'object') {
              arr = Object.entries(cal).map(([region, datos]) => ({ region, ...(typeof datos === 'object' ? datos : { descripcion: String(datos) }) }));
          }
          return arr.map((item, idx) => ({ ...item, id: item.id || item.region || `region_${idx}` })); // Inyectar ID para keyExtractor
      };

      estructurado.calendarios_regionales = normalizarCalendario(estructurado.calendarios_regionales);

      // ==========================================
      // 2. ESTADÍSTICAS Y MERCADO (EstadisticasScreen)
      // ==========================================
      
      // Costos y Rentabilidad: Todo a flotante seguro
      if (!estructurado.costos_produccion) {
          estructurado.costos_produccion = { costo_total_ha: 0, desglose: [] };
      } else {
          estructurado.costos_produccion.costo_total_ha = this._safeFloat(estructurado.costos_produccion.costo_total_ha);
          estructurado.costos_produccion.desglose = this._normalizarLista(estructurado.costos_produccion.desglose).map(item => {
              if (typeof item !== 'object') return { concepto: String(item), monto: 0, porcentaje: 0 };
              return { 
                  ...item, 
                  concepto: String(item.concepto || item.nombre || "Concepto"),
                  monto: this._safeFloat(item.monto || item.monto_mxn || item.costo || item.costo_ha), 
                  porcentaje: this._safeFloat(item.porcentaje || item.porcentaje_total) 
              };
          });
      }

      if (estructurado.analisis_rentabilidad) {
          const ar = estructurado.analisis_rentabilidad;
          estructurado.analisis_rentabilidad = {
              ...ar,
              inversion_inicial_ha: this._safeFloat(ar.inversion_inicial_ha || ar.costo_establecimiento_ha || ar.costo_total_produccion_ha),
              ingreso_anual_esperado_ha: this._safeFloat(ar.ingreso_anual_esperado_ha || ar.ingreso_bruto_esperado_ha || ar.utilidad_neta_esperada_ha),
              utilidad_neta_anual_ha: this._safeFloat(ar.utilidad_neta_anual_ha || ar.utilidad_neta_ha),
              roi_pct: this._safeFloat(ar.roi_pct),
              años_recuperacion: this._safeFloat(ar.años_recuperacion)
          };
      } else {
          estructurado.analisis_rentabilidad = { inversion_inicial_ha: 0, ingreso_anual_esperado_ha: 0, utilidad_neta_anual_ha: 0, roi_pct: 0, años_recuperacion: 0 };
      }

      if (estructurado.economia_expandida) {
          const eco = estructurado.economia_expandida;
          estructurado.economia_expandida = {
              ...eco,
              precio_max_mxn_ton: this._safeFloat(eco.precio_max_mxn_ton),
              precio_min_mxn_ton: this._safeFloat(eco.precio_min_mxn_ton),
              precio_promedio_mxn_ton: this._safeFloat(eco.precio_promedio_mxn_ton)
          };
      }

      if (estructurado.comercio_exterior_economia) {
          const com = estructurado.comercio_exterior_economia;
          estructurado.comercio_exterior_economia = {
              ...com,
              consumo_nacional_kg_percapita: this._safeFloat(com.consumo_nacional_kg_percapita),
              empleos_generados: this._safeFloat(com.empleos_generados || com.empleos_directos),
              exportaciones_t: this._safeFloat(com.exportaciones_t || com.exportacion_ton),
              importaciones_t: this._safeFloat(com.importaciones_t || com.importacion_ton),
              precio_medio_rural_mxn_kg: this._safeFloat(com.precio_medio_rural_mxn_kg),
              valor_produccion_millones_mxn: this._safeFloat(com.valor_produccion_millones_mxn),
              valor_exportaciones_millones_usd: this._safeFloat(com.valor_exportaciones_millones_usd || com.valor_exportacion_mdd || com.exportaciones_millones_usd)
          };
      }

      if (estructurado.panorama_2025_summary) {
          const pan = estructurado.panorama_2025_summary;
          estructurado.panorama_2025_summary = {
              ...pan,
              ranking_mundial: this._safeFloat(pan.ranking_mundial),
              produccion_miles_ton: this._safeFloat(pan.produccion_miles_ton),
              variacion_anual_pct: this._safeFloat(pan.variacion_anual_pct)
          };
      }

      if (estructurado.historial_produccion) {
          estructurado.historial_produccion = this._normalizarLista(estructurado.historial_produccion).map((item, idx) => {
              if (typeof item === 'object') {
                  return { 
                      ...item, 
                      year: String(item.year || item.anio || item.año || `Año ${idx + 1}`),
                      produccion_ton: this._safeFloat(item.produccion_ton || item.produccion_t || item.produccion),
                      rendimiento_t_ha: this._safeFloat(item.rendimiento_t_ha || item.rendimiento)
                  };
              }
              return { year: `Año ${idx + 1}`, produccion_ton: this._safeFloat(item), rendimiento_t_ha: 0 };
          });
      } else {
          estructurado.historial_produccion = [];
      }

      if (!estructurado.detalle_produccion_nacional) {
          estructurado.detalle_produccion_nacional = { principales_estados: [], produccion_nacional_t: 0, rendimiento_promedio_t_ha: 0, superficie_nacional_ha: 0 };
      } else {
        estructurado.detalle_produccion_nacional.produccion_nacional_t = this._safeFloat(estructurado.detalle_produccion_nacional.produccion_nacional_t);
        estructurado.detalle_produccion_nacional.rendimiento_promedio_t_ha = this._safeFloat(estructurado.detalle_produccion_nacional.rendimiento_promedio_t_ha);
        estructurado.detalle_produccion_nacional.superficie_nacional_ha = this._safeFloat(estructurado.detalle_produccion_nacional.superficie_nacional_ha);

        if (estructurado.detalle_produccion_nacional.principales_estados) {
            estructurado.detalle_produccion_nacional.principales_estados = this._normalizarLista(estructurado.detalle_produccion_nacional.principales_estados).map(estado => {
                if (typeof estado === 'string') return { estado, participacion_pct: 0, superficie_ha: 0, rendimiento_t_ha: 0 };
                return {
                    ...estado,
                    estado: String(estado.estado || estado.nombre || "Desconocido"),
                    rendimiento_t_ha: this._safeFloat(estado.rendimiento_t_ha),
                    superficie_ha: this._safeFloat(estado.superficie_ha),
                    participacion_pct: this._safeFloat(estado.participacion_pct)
                };
            });
        }
      }

      if (!estructurado.mercado_comercializacion) {
          estructurado.mercado_comercializacion = { canales_venta: [], destinos_principales: [], requisitos_exportacion: [], temporadas_precio: { alto: [], bajo: [] } };
      } else {
        estructurado.mercado_comercializacion.canales_venta = this._normalizarLista(estructurado.mercado_comercializacion.canales_venta).map(canal => {
            if (typeof canal === 'string') return { canal, participacion_pct: 0, precio_promedio_kg: 0 };
            return {
                ...canal,
                canal: String(canal.canal || canal.nombre || "Canal"),
                participacion_pct: this._safeFloat(canal.participacion_pct || canal.porcentaje),
                precio_promedio_kg: this._safeFloat(canal.precio_promedio_kg || canal.precio)
            };
        });

        estructurado.mercado_comercializacion.requisitos_exportacion = this._normalizarLista(estructurado.mercado_comercializacion.requisitos_exportacion);
        
        if (estructurado.mercado_comercializacion.destinos_principales) {
            estructurado.mercado_comercializacion.destinos_principales = this._normalizarLista(estructurado.mercado_comercializacion.destinos_principales).map(destino => {
              if (typeof destino === 'string') return destino;
              return { 
                  ...destino,
                  destino: String(destino.destino || destino.pais || "Desconocido"), 
                  porcentaje: this._safeFloat(destino.porcentaje || destino.participacion_pct) 
              };
           });
        }
      }

      // Adaptador Inteligente para temporadas de precios en array (Evita colapso de riesgo)
      const normalizarTemporadas = (temp) => {
          if (!temp) return { alto: [], bajo: [] };
          if (Array.isArray(temp)) {
              let alto = [], bajo = [];
              temp.forEach(t => {
                  if (typeof t !== 'object') return;
                  const meses = t.meses || t.mes || "";
                  if (!meses) return;
                  const oferta = String(t.oferta || "").toLowerCase();
                  if (oferta.includes('baja') || oferta.includes('escasa') || t.temporada === 'alto') alto.push(meses);
                  else if (oferta.includes('alta') || oferta.includes('abundante') || t.temporada === 'bajo') bajo.push(meses);
              });
              return { alto, bajo };
          }
          if (typeof temp === 'object') {
              return { alto: this._normalizarLista(temp.alto), bajo: this._normalizarLista(temp.bajo) };
          }
          return { alto: [], bajo: [] };
      };

      estructurado.temporadas_precio = normalizarTemporadas(estructurado.temporadas_precio);
      if (estructurado.mercado_comercializacion && estructurado.mercado_comercializacion.temporadas_precio) {
          estructurado.mercado_comercializacion.temporadas_precio = normalizarTemporadas(estructurado.mercado_comercializacion.temporadas_precio);
          // Duplicamos al root para EstadisticasScreen
          estructurado.temporadas_precio = estructurado.mercado_comercializacion.temporadas_precio;
      }
      
      // ==========================================
      // 3. PLAGAS Y ENFERMEDADES (PlagasScreen)
      // ==========================================
      if (!estructurado.riesgos_detallados) {
          const plagasArray = this._normalizarDiccionarioRiesgosAArray(estructurado.plagas_detalladas, 'Plaga');
          const enfArray = this._normalizarDiccionarioRiesgosAArray(estructurado.enfermedades_detalladas, 'Enfermedad');
          estructurado.riesgos_detallados = plagasArray.length || enfArray.length ? [...plagasArray, ...enfArray] : [];
      } else {
          estructurado.riesgos_detallados = this._normalizarDiccionarioRiesgosAArray(estructurado.riesgos_detallados, 'Riesgo');
      }

      estructurado.riesgos_detallados = estructurado.riesgos_detallados
        .filter(p => p && String(p.nombre).toLowerCase() !== "principales" && String(p.nombre_plaga).toLowerCase() !== "principales")
        .map(plaga => {
          const quimicoLimpio = this._normalizarLista(plaga.control_quimico).map(q => {
              if (typeof q === 'string') return { ingrediente_activo: q };
              if (typeof q === 'object') return { ...q, ingrediente_activo: q.ingrediente_activo || q.ingrediente || q.nombre || q.nombre_comercial || "No especificado" };
              return null;
          }).filter(Boolean);

          let controlNormalizado = plaga.control || {};
          controlNormalizado.mecanismo = controlNormalizado.mecanismo || (quimicoLimpio.length > 0 ? 'Aplicación Química' : 'No especificado');
          controlNormalizado.biologico = controlNormalizado.biologico || plaga.control_biologico || 'No especificado';
          
          controlNormalizado.productos_activos_mexico = this._normalizarLista(controlNormalizado.productos_activos_mexico).map(p => {
              if (typeof p === 'string') return { ingrediente: p };
              if (typeof p === 'object') return { ...p, ingrediente: p.ingrediente || p.ingrediente_activo || p.nombre || "No especificado" };
              return null;
          }).filter(Boolean);

          let manejoSeguro = plaga.manejo_integrado || { general: "Consulte especialista." };
          if (typeof manejoSeguro === 'string') manejoSeguro = { general: manejoSeguro };

          let cicloDesc = plaga.ciclo_desarrollo;
          if (typeof cicloDesc !== 'object' || cicloDesc === null) cicloDesc = {};

          const fasesLimpio = this._normalizarLista(plaga.fases_vulnerables).map(f => {
              if (typeof f === 'string') return { fase_bbch: f, nivel_riesgo: 'medio' };
              return f;
          });

          return {
            ...plaga,
            control_quimico: quimicoLimpio,
            control: controlNormalizado,
            manejo_integrado: manejoSeguro,
            fases_vulnerables: fasesLimpio,
            ciclo_desarrollo: { ...cicloDesc, gdd_requeridos: String(cicloDesc.gdd_ciclo_completo || cicloDesc.gdd_primera_generacion || cicloDesc.gdd_requeridos || "0") },
            condiciones_desarrollo: plaga.condiciones_desarrollo || { temperatura_optima: 'No disponible' }
          };
      });

      // ==========================================
      // 4. GUÍA Y LABORES (LaboresScreen / GuiaScreen)
      // ==========================================
      if (estructurado.programa_fertilizacion) {
        if (this._isStrictObject(estructurado.programa_fertilizacion) && estructurado.programa_fertilizacion.etapas) {
            estructurado.programa_fertilizacion = Object.entries(estructurado.programa_fertilizacion.etapas).map(([etapa, detalles]) => ({
              etapa: etapa,
              detalles: typeof detalles === 'string' ? detalles : JSON.stringify(detalles),
              dosis_base: estructurado.programa_fertilizacion.dosis_npk || 'No especificada'
            }));
        } else {
            estructurado.programa_fertilizacion = this._normalizarLista(estructurado.programa_fertilizacion).map(item => {
                if (typeof item === 'string') return { etapa: 'General', detalles: item };
                if (typeof item === 'object') {
                    return { ...item, etapa: item.etapa || 'Aplicación', detalles: item.detalles || item.formula || item.recomendacion || JSON.stringify(item) };
                }
                return { etapa: 'General', detalles: 'Información no disponible' };
            });
        }
      } else {
        estructurado.programa_fertilizacion = [];
      }

      if (estructurado.calendario_riego_mensual) {
        if (this._isStrictObject(estructurado.calendario_riego_mensual)) {
            if (estructurado.calendario_riego_mensual.calendario_riego) estructurado.calendario_riego = this._normalizarLista(estructurado.calendario_riego_mensual.calendario_riego);
            if (estructurado.calendario_riego_mensual.sistemas_recomendados) estructurado.calendario_riego_mensual.sistemas_recomendados = this._normalizarLista(estructurado.calendario_riego_mensual.sistemas_recomendados);
        } else {
            estructurado.calendario_riego = this._normalizarLista(estructurado.calendario_riego_mensual);
        }
      }

      if (estructurado.alertas_riesgos) {
        if (Array.isArray(estructurado.alertas_riesgos) || this._isFirebaseMutatedArray(estructurado.alertas_riesgos)) {
            estructurado.alertas_riesgos = this._normalizarLista(estructurado.alertas_riesgos);
        } else if (typeof estructurado.alertas_riesgos === 'object') {
            let alertasArray = [];
            Object.entries(estructurado.alertas_riesgos).forEach(([categoria, subcategorias]) => {
                if (this._isStrictObject(subcategorias)) {
                    Object.entries(subcategorias).forEach(([riesgoNombre, detalles]) => {
                        alertasArray.push({ tipo: categoria, riesgo: riesgoNombre, impacto: detalles?.impacto || 'No especificado', mitigacion: detalles?.mitigacion || detalles?.prevencion || 'Sin mitigación', probabilidad: detalles?.probabilidad || 'Variable' });
                    });
                } else if (typeof subcategorias === 'string') {
                    alertasArray.push({ tipo: categoria, riesgo: categoria, impacto: 'Variable', mitigacion: subcategorias, probabilidad: 'Variable' });
                }
            });
            estructurado.alertas_riesgos = alertasArray;
        }
      } else {
        estructurado.alertas_riesgos = [];
      }

      // ==========================================
      // 5. MISCELÁNEOS
      // ==========================================
      if (estructurado.sistemas_recomendados && estructurado.sistemas_recomendados.sistemas_riego) {
        estructurado.sistemas_riego = this._normalizarLista(estructurado.sistemas_recomendados.sistemas_riego);
      } else if (estructurado.sistemas_riego) {
        estructurado.sistemas_riego = this._normalizarLista(estructurado.sistemas_riego);
      } else {
        estructurado.sistemas_riego = [];
      }

      if (estructurado.recursos_asistencia) {
        if (estructurado.recursos_asistencia.instituciones) {
            estructurado.recursos_asistencia.instituciones = this._normalizarLista(estructurado.recursos_asistencia.instituciones).map(inst => {
                if (typeof inst !== 'object') return { nombre: String(inst), servicios: [] };
                return { ...inst, servicios: this._normalizarLista(inst.servicios) };
            });
            estructurado.instituciones = estructurado.recursos_asistencia.instituciones; 
        }
        if (estructurado.recursos_asistencia.programas_apoyo_disponibles) {
            estructurado.recursos_asistencia.programas_apoyo_disponibles = this._normalizarLista(estructurado.recursos_asistencia.programas_apoyo_disponibles);
        }
      }
      
      estructurado.nombre_cientifico = estructurado.nombre_cientifico || estructurado.nombre_botanico || "No disponible";
      
      return estructurado;
    } catch (error) {
      console.error("❌ Error CRÍTICO en _prepararEstructura:", error);
      return data; 
    }
  }

  async obtenerCultivo(nombreCultivo, nivelRequerido = 'completo', forzarActualizacion = false) {
    const cacheKey = `cultivo_${nombreCultivo}_${nivelRequerido}`;

    if (!forzarActualizacion) {
      try {
        const cachedData = await AsyncStorage.getItem(cacheKey);
        if (cachedData) return JSON.parse(cachedData);
      } catch (e) { console.warn("Error en caché", e); }
    }

    try {
      const encodedName = encodeURIComponent(nombreCultivo);
      const response = await fetch(`${FIREBASE_URL}/cultivos/${encodedName}.json`);
      
      if (response.ok) {
        const data = await response.json();
        if (data) {
          const processedData = this._prepararEstructura(data);
          if (this._validarDatosMinimos(processedData)) {
            await AsyncStorage.setItem(cacheKey, JSON.stringify(processedData));
            return processedData;
          }
        }
      }
    } catch (error) { console.log("⚠️ Error de Red:", error.message); }

    if (datosBasicosLocal?.cultivos) {
      const nombreNorm = nombreCultivo.charAt(0).toUpperCase() + nombreCultivo.slice(1);
      const dataLocal = datosBasicosLocal.cultivos[nombreCultivo] || datosBasicosLocal.cultivos[nombreNorm];
      if (dataLocal) {
        const processedLocal = this._prepararEstructura(dataLocal);
        return { ...processedLocal, _origen: 'local_basico', _nivel: dataLocal._nivel || 'basico' };
      }
    }
    return null;
  }

  obtenerListaBasica() {
    return (datosBasicosLocal && datosBasicosLocal.cultivos) ? Object.keys(datosBasicosLocal.cultivos) : [];
  }
}

export default new CultivoDataManager();