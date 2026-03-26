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
    return Math.max(...keys.map(k => parseInt(k))) < 1900;
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

  _safeStringArray(arr) {
    if (!arr) return [];
    return this._normalizarLista(arr).map(item => {
        if (typeof item === 'object' && item !== null) {
            return Object.values(item).map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
        }
        return String(item || "");
    }).filter(s => s.trim() !== "");
  }

  _isStrictObject(obj) {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj) && !this._isFirebaseMutatedArray(obj);
  }

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

  _prepararEstructura(data) {
    try {
      if (!data) return null;
      let estructurado = { ...data };

      // ==========================================
      // 0. LIMPIEZA Y BLINDAJE ESTRUCTURAL (ELIMINADOR DE TYPE ERRORS)
      // ==========================================
      const arrayFields = ['buenas_practicas_destacadas', 'conclusiones_recomendaciones', 'errores_comunes_evitar', 'guia_buenas_practicas', 'guia_errores_comunes', 'recomendaciones_clave'];
      arrayFields.forEach(field => {
          estructurado[field] = this._safeStringArray(estructurado[field]);
      });

      estructurado.nombre_cientifico = String(estructurado.nombre_cientifico || estructurado.nombre_botanico || "No disponible");

      if (estructurado.principales_estados) {
          estructurado.principales_estados = this._normalizarLista(estructurado.principales_estados).map(e => 
              typeof e === 'object' ? String(e.estado || e.nombre || e.region || "Desconocido") : String(e)
          );
      }

      // ESCUDO MAESTRO: Si Firebase corrompe cualquier nodo raíz, se inicializa como un diccionario vacío y seguro.
      const dictFields = [
          'labores', 'labores_culturales', 'deficiencias_nutricionales', 
          'costos_produccion_detallados', 'presupuesto_labores_detallado', 
          'requerimientos_agroclimaticos', 'postcosecha', 'comercio_exterior_economia', 
          'economia_expandida', 'detalle_produccion_nacional', 'analisis_rentabilidad', 
          'panorama_2025_summary', 'mercado_comercializacion', 'ciclo_fenologico'
      ];
      
      dictFields.forEach(field => {
          if (estructurado[field] && this._isStrictObject(estructurado[field])) {
              if (field === 'labores' || field === 'labores_culturales') {
                  Object.keys(estructurado[field]).forEach(key => {
                      estructurado[field][key] = this._normalizarLista(estructurado[field][key]);
                  });
              }
              if (field === 'costos_produccion_detallados' || field === 'presupuesto_labores_detallado') {
                  Object.keys(estructurado[field]).forEach(key => {
                      estructurado[field][key] = this._safeFloat(estructurado[field][key]);
                  });
              }
          } else {
              estructurado[field] = {}; 
          }
      });

      estructurado.produccion_toneladas = this._safeFloat(estructurado.produccion_toneladas || estructurado.produccion_nacional_t);
      estructurado.superficie_sembrada_ha = this._safeFloat(estructurado.superficie_sembrada_ha || estructurado.superficie_nacional_ha);
      estructurado.rendimiento_ton_ha = this._safeFloat(estructurado.rendimiento_ton_ha || estructurado.rendimiento_promedio_t_ha);

      // ==========================================
      // 1. FENOLOGÍA Y CALENDARIOS
      // ==========================================
      if (Object.keys(estructurado.ciclo_fenologico).length === 0) {
          estructurado.ciclo_fenologico = { etapas: [], fechas_por_estado: [], variedades_principales: [] };
      } else {
          let diasAcumulados = 0;
          estructurado.ciclo_fenologico.etapas = this._normalizarLista(estructurado.ciclo_fenologico.etapas).map(e => {
              if (typeof e !== 'object') return { nombre: String(e), inicio_dias: diasAcumulados, duracion_dias: 10 };
              
              const duracion = this._safeFloat(e.duracion_dias || e.duracion, 10) || 1; 
              const inicio = (e.inicio_dias !== undefined && e.inicio_dias !== null) ? this._safeFloat(e.inicio_dias, 0) : diasAcumulados;
              diasAcumulados = inicio + duracion;
              
              return { ...e, inicio_dias: inicio, duracion_dias: duracion, nombre: String(e.nombre || e.fase || e.bbch_fase || "Fase") };
          });
          
          estructurado.ciclo_fenologico.fechas_por_estado = this._normalizarLista(estructurado.ciclo_fenologico.fechas_por_estado);
          estructurado.ciclo_fenologico.variedades_principales = this._safeStringArray(estructurado.ciclo_fenologico.variedades_principales);
      }

      if (estructurado.bbch_detallado) {
          estructurado.bbch_detallado = this._normalizarLista(estructurado.bbch_detallado).map(fase => {
              if (typeof fase !== 'object') return { nombre_fase: String(fase), codigo_bbch: "", actividades_criticas: [] };
              return { 
                  ...fase, 
                  nombre_fase: String(fase.nombre_fase || fase.fase_original || fase.nombre || fase.fase || "Fase"),
                  codigo_bbch: String(fase.codigo_bbch || fase.bbch_fase || ""),
                  actividades_criticas: this._safeStringArray(fase.actividades_criticas) 
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
          return arr.map((item, idx) => ({ ...item, id: String(item.id || item.region || `region_${idx}`) })); 
      };

      estructurado.calendarios_regionales = normalizarCalendario(estructurado.calendarios_regionales);

      // ==========================================
      // 2. ESTADÍSTICAS Y MERCADO
      // ==========================================
      if (!estructurado.costos_produccion || Object.keys(estructurado.costos_produccion).length === 0) {
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

      if (Object.keys(estructurado.analisis_rentabilidad).length > 0) {
          const ar = estructurado.analisis_rentabilidad;
          estructurado.analisis_rentabilidad = {
              ...ar,
              inversion_inicial_ha: this._safeFloat(ar.inversion_inicial_ha || ar.costo_establecimiento_ha || ar.costo_total_produccion_ha),
              ingreso_anual_esperado_ha: this._safeFloat(ar.ingreso_anual_esperado_ha || ar.ingreso_bruto_esperado_ha || ar.utilidad_neta_esperada_ha),
              utilidad_neta_anual_ha: this._safeFloat(ar.utilidad_neta_anual_ha || ar.utilidad_neta_ha),
              roi_pct: this._safeFloat(ar.roi_pct)
          };
      }

      if (Object.keys(estructurado.economia_expandida).length > 0) {
          const eco = estructurado.economia_expandida;
          estructurado.economia_expandida = {
              ...eco,
              precio_max_mxn_ton: this._safeFloat(eco.precio_max_mxn_ton),
              precio_min_mxn_ton: this._safeFloat(eco.precio_min_mxn_ton),
              precio_promedio_mxn_ton: this._safeFloat(eco.precio_promedio_mxn_ton)
          };
      }

      if (Object.keys(estructurado.comercio_exterior_economia).length > 0) {
          const com = estructurado.comercio_exterior_economia;
          estructurado.comercio_exterior_economia = {
              ...com,
              consumo_nacional_kg_percapita: this._safeFloat(com.consumo_nacional_kg_percapita),
              empleos_generados: this._safeFloat(com.empleos_generados || com.empleos_directos),
              exportaciones_t: this._safeFloat(com.exportaciones_t || com.exportacion_ton),
              valor_exportaciones_millones_usd: this._safeFloat(com.valor_exportaciones_millones_usd || com.valor_exportacion_mdd || com.exportaciones_millones_usd)
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
      }

      if (Object.keys(estructurado.detalle_produccion_nacional).length === 0) {
          estructurado.detalle_produccion_nacional = { principales_estados: [], produccion_nacional_t: 0, rendimiento_promedio_t_ha: 0, superficie_nacional_ha: 0 };
      } else {
        estructurado.detalle_produccion_nacional.produccion_nacional_t = this._safeFloat(estructurado.detalle_produccion_nacional.produccion_nacional_t);
        estructurado.detalle_produccion_nacional.rendimiento_promedio_t_ha = this._safeFloat(estructurado.detalle_produccion_nacional.rendimiento_promedio_t_ha);
        estructurado.detalle_produccion_nacional.superficie_nacional_ha = this._safeFloat(estructurado.detalle_produccion_nacional.superficie_nacional_ha);

        if (estructurado.detalle_produccion_nacional.principales_estados) {
            estructurado.detalle_produccion_nacional.principales_estados = this._normalizarLista(estructurado.detalle_produccion_nacional.principales_estados).map(estado => {
                if (typeof estado === 'string') return { estado: String(estado), participacion_pct: 0, superficie_ha: 0, rendimiento_t_ha: 0 };
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

      if (Object.keys(estructurado.mercado_comercializacion).length === 0) {
          estructurado.mercado_comercializacion = { canales_venta: [], destinos_principales: [], requisitos_exportacion: [], temporadas_precio: { alto: [], bajo: [] } };
      } else {
        estructurado.mercado_comercializacion.canales_venta = this._normalizarLista(estructurado.mercado_comercializacion.canales_venta).map(canal => {
            if (typeof canal === 'string') return { canal: String(canal), participacion_pct: 0, precio_promedio_kg: 0 };
            return {
                ...canal,
                canal: String(canal.canal || canal.nombre || "Canal"),
                participacion_pct: this._safeFloat(canal.participacion_pct || canal.porcentaje),
                precio_promedio_kg: this._safeFloat(canal.precio_promedio_kg || canal.precio)
            };
        });
        
        if (estructurado.mercado_comercializacion.destinos_principales) {
            estructurado.mercado_comercializacion.destinos_principales = this._normalizarLista(estructurado.mercado_comercializacion.destinos_principales).map(destino => {
              if (typeof destino === 'string') return String(destino);
              return { 
                  ...destino,
                  destino: String(destino.destino || destino.pais || "Desconocido"), 
                  porcentaje: this._safeFloat(destino.porcentaje || destino.participacion_pct) 
              };
           });
        }
      }

      const normalizarTemporadas = (temp) => {
          if (!temp) return { alto: [], bajo: [] };
          if (Array.isArray(temp)) {
              let alto = [], bajo = [];
              temp.forEach(t => {
                  if (typeof t === 'string') alto.push(t);
                  else if (typeof t === 'object' && t !== null) {
                      const meses = t.meses || t.mes || "";
                      if (!meses) return;
                      const oferta = String(t.oferta || t.temporada || "").toLowerCase();
                      if (oferta.includes('baja') || oferta === 'alto') alto.push(meses);
                      else bajo.push(meses);
                  }
              });
              return { alto: this._safeStringArray(alto), bajo: this._safeStringArray(bajo) };
          }
          if (typeof temp === 'object') {
              return { alto: this._safeStringArray(temp.alto), bajo: this._safeStringArray(temp.bajo) };
          }
          return { alto: [], bajo: [] };
      };

      estructurado.temporadas_precio = normalizarTemporadas(estructurado.temporadas_precio);
      if (estructurado.mercado_comercializacion && estructurado.mercado_comercializacion.temporadas_precio) {
          estructurado.mercado_comercializacion.temporadas_precio = normalizarTemporadas(estructurado.mercado_comercializacion.temporadas_precio);
          estructurado.temporadas_precio = estructurado.mercado_comercializacion.temporadas_precio;
      }
      
      // ==========================================
      // 3. PLAGAS Y ENFERMEDADES 
      // ==========================================
      if (!estructurado.riesgos_detallados) {
          const plagasArray = this._normalizarDiccionarioRiesgosAArray(estructurado.plagas_detalladas, 'Plaga');
          const enfArray = this._normalizarDiccionarioRiesgosAArray(estructurado.enfermedades_detalladas, 'Enfermedad');
          estructurado.riesgos_detallados = plagasArray.length || enfArray.length ? [...plagasArray, ...enfArray] : [];
      } else {
          estructurado.riesgos_detallados = this._normalizarDiccionarioRiesgosAArray(estructurado.riesgos_detallados, 'Riesgo');
      }

      // ==========================================
      // 4. MISCELÁNEOS
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
      const response = await fetch(`${FIREBASE_URL}/cultivos/${encodeURIComponent(nombreCultivo)}.json`);
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
}

export default new CultivoDataManager();