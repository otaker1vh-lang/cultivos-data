import AsyncStorage from '@react-native-async-storage/async-storage';
import datosBasicosLocal from '../data/cultivos_basico.json'; 

const FIREBASE_URL = "https://cultivos-d97e2-default-rtdb.firebaseio.com";

class CultivoDataManager {

  /**
   * DETECTOR INTELIGENTE DE MUTACIONES DE FIREBASE
   * Verifica si Firebase convirtió un Array en un Objeto numérico.
   * Utiliza una heurística de año (< 1900) para no destruir historiales de producción.
   */
  _isFirebaseMutatedArray(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    
    // Verifica si TODAS las llaves son números enteros >= 0
    const allNumbers = keys.every(key => !isNaN(key) && Number.isInteger(parseFloat(key)) && parseInt(key) >= 0);
    if (!allNumbers) return false;

    // Si el número más pequeño es menor a 1900, es un array corrupto (0, 1, 2...).
    // Si es mayor (ej. 2020, 2021), es un diccionario de historial y lo respetamos.
    const minIndex = Math.min(...keys.map(k => parseInt(k)));
    return minIndex < 1900;
  }

  /**
   * NORMALIZADOR DE LISTAS ESTRICTO
   * Convierte a Array, limpia nulos, y protege Strings/Números de ser despedazados.
   */
  _normalizarLista(data) {
    if (data === null || data === undefined) return [];
    if (typeof data === 'string' || typeof data === 'number') return [data];
    if (Array.isArray(data)) return data.filter(item => item !== null && item !== undefined);
    
    if (typeof data === 'object') {
        return Object.values(data).filter(item => item !== null && item !== undefined);
    }
    return [];
  }

  _validarDatosMinimos(data) {
    return !!(data && data._nivel);
  }

  /**
   * EL NORMALIZADOR MAESTRO (BLINDAJE TOTAL Y DEFINITIVO)
   */
  _prepararEstructura(data) {
    try {
      if (!data) return null;
      let estructurado = { ...data };

      // ==========================================
      // 1. PLAGAS Y ENFERMEDADES (PlagasScreen)
      // ==========================================
      if (!estructurado.riesgos_detallados && estructurado.plagas_detalladas) {
          estructurado.riesgos_detallados = estructurado.plagas_detalladas;
      }

      if (estructurado.riesgos_detallados) {
        let riesgosArray = [];
        
        if (Array.isArray(estructurado.riesgos_detallados)) {
            riesgosArray = estructurado.riesgos_detallados;
        } else if (this._isFirebaseMutatedArray(estructurado.riesgos_detallados)) {
            riesgosArray = Object.values(estructurado.riesgos_detallados);
        } else {
            riesgosArray = Object.entries(estructurado.riesgos_detallados).map(([nombre, detalles]) => ({
                nombre_plaga: nombre, 
                ...detalles
            }));
        }

        estructurado.riesgos_detallados = riesgosArray
          .filter(p => p && p.nombre !== "principales" && p.nombre_plaga !== "principales")
          .map(plaga => {
            
            // Blindaje de Químicos
            const quimicoRaw = this._normalizarLista(plaga.control_quimico);
            const quimicoLimpio = quimicoRaw.map(q => {
                if (typeof q === 'string') return { ingrediente_activo: q };
                if (typeof q === 'object') return {
                    ...q,
                    ingrediente_activo: q.ingrediente_activo || q.ingrediente || q.nombre || "No especificado"
                };
                return null;
            }).filter(Boolean);

            let controlNormalizado = plaga.control || {};
            controlNormalizado.mecanismo = controlNormalizado.mecanismo || (quimicoLimpio.length > 0 ? 'Aplicación Química' : 'No especificado');
            controlNormalizado.biologico = controlNormalizado.biologico || plaga.control_biologico || 'No especificado';
            
            const pamRaw = this._normalizarLista(controlNormalizado.productos_activos_mexico);
            controlNormalizado.productos_activos_mexico = pamRaw.map(p => {
                if (typeof p === 'string') return { ingrediente: p };
                if (typeof p === 'object') return {
                    ...p,
                    ingrediente: p.ingrediente || p.ingrediente_activo || p.nombre || "No especificado"
                };
                return null;
            }).filter(Boolean);

            // Blindaje de Manejo Integrado contra Strings Planos
            let manejoSeguro = plaga.manejo_integrado;
            if (!manejoSeguro) {
                manejoSeguro = { general: "Consulte con un especialista para un plan de manejo integrado." };
            } else if (typeof manejoSeguro === 'string') {
                manejoSeguro = { general: manejoSeguro };
            }

            const cicloDesc = plaga.ciclo_desarrollo || {};

            return {
              ...plaga,
              control_quimico: quimicoLimpio,
              control: controlNormalizado,
              manejo_integrado: manejoSeguro,
              ciclo_desarrollo: {
                  ...cicloDesc,
                  gdd_requeridos: cicloDesc.gdd_ciclo_completo || cicloDesc.gdd_primera_generacion || "0"
              },
              condiciones_desarrollo: plaga.condiciones_desarrollo || { temperatura_optima: 'No disponible' }
            };
        });
      }

      // ==========================================
      // 2. FENOLOGÍA Y CALENDARIOS (FenologiaScreen)
      // ==========================================
      if (estructurado.ciclo_fenologico?.etapas) {
        estructurado.ciclo_fenologico.etapas = this._normalizarLista(estructurado.ciclo_fenologico.etapas);
      }
      
      const normalizarCalendario = (cal) => {
          if (!cal) return [];
          if (Array.isArray(cal)) return cal.filter(Boolean);
          if (this._isFirebaseMutatedArray(cal)) return Object.values(cal).filter(Boolean);
          if (typeof cal === 'object') {
              return Object.entries(cal).map(([region, datos]) => ({ 
                  region, 
                  ...(typeof datos === 'object' ? datos : { descripcion: datos }) 
              }));
          }
          return [];
      };

      estructurado.calendarios_regionales = normalizarCalendario(estructurado.calendarios_regionales);
      if (!estructurado.calendarios_regionales.length && estructurado.calendarios) {
          estructurado.calendarios = normalizarCalendario(estructurado.calendarios);
      }

      // ==========================================
      // 3. ESTADÍSTICAS Y MERCADO (EstadisticasScreen)
      // ==========================================
      if (estructurado.historial_produccion) {
        if (Array.isArray(estructurado.historial_produccion)) {
            estructurado.historial_produccion = estructurado.historial_produccion.filter(Boolean).map((item, idx) => 
                typeof item === 'object' ? item : { year: `Año ${idx + 1}`, produccion_ton: item }
            );
        } else if (this._isFirebaseMutatedArray(estructurado.historial_produccion)) {
            estructurado.historial_produccion = Object.values(estructurado.historial_produccion).filter(Boolean).map((item, idx) => 
                typeof item === 'object' ? item : { year: `Año ${idx + 1}`, produccion_ton: item }
            );
        } else if (typeof estructurado.historial_produccion === 'object') {
            estructurado.historial_produccion = Object.entries(estructurado.historial_produccion).map(([year, data]) => ({
                year: year,
                ...(typeof data === 'object' ? data : { produccion_ton: data })
            }));
        }
      }

      if (estructurado.detalle_produccion_nacional?.principales_estados) {
        let estados = this._normalizarLista(estructurado.detalle_produccion_nacional.principales_estados);
        estructurado.detalle_produccion_nacional.principales_estados = estados.map(estado => {
          if (typeof estado === 'string') return { estado, participacion_pct: 0, superficie_ha: 0 };
          return {
            ...estado,
            rendimiento_t_ha: typeof estado.rendimiento_t_ha === 'number' ? estado.rendimiento_t_ha : 0,
            superficie_ha: typeof estado.superficie_ha === 'number' ? estado.superficie_ha : 0,
            participacion_pct: typeof estado.participacion_pct === 'number' ? estado.participacion_pct : 0
          };
        });
      }

      if (estructurado.mercado_comercializacion) {
        if (estructurado.mercado_comercializacion.canales_venta) {
            estructurado.mercado_comercializacion.canales_venta = this._normalizarLista(estructurado.mercado_comercializacion.canales_venta);
        }
        if (estructurado.mercado_comercializacion.destinos_principales) {
            let destinos = this._normalizarLista(estructurado.mercado_comercializacion.destinos_principales);
            estructurado.mercado_comercializacion.destinos_principales = destinos.map(destino => {
              if (typeof destino === 'string') {
                 const match = destino.match(/(.+?)\s*\(([\d.]+)%\)/);
                 if (match) return { destino: match[1].trim(), porcentaje: parseFloat(match[2]) };
                 return { destino, porcentaje: null };
              }
              return { destino: destino.destino || destino.pais || "Desconocido", porcentaje: destino.porcentaje || null };
           });
        }
      }

      if (estructurado.temporadas_precio) {
        estructurado.temporadas_precio.alto = this._normalizarLista(estructurado.temporadas_precio.alto);
        estructurado.temporadas_precio.bajo = this._normalizarLista(estructurado.temporadas_precio.bajo);
      }
      
      if (estructurado.analisis_rentabilidad) {
        if (estructurado.analisis_rentabilidad.meses_precio_alto) {
            estructurado.analisis_rentabilidad.meses_precio_alto = this._normalizarLista(estructurado.analisis_rentabilidad.meses_precio_alto);
        }
        if (estructurado.analisis_rentabilidad.meses_precio_bajo) {
            estructurado.analisis_rentabilidad.meses_precio_bajo = this._normalizarLista(estructurado.analisis_rentabilidad.meses_precio_bajo);
        }
      }

      // ==========================================
      // 4. GUÍA Y LABORES (LaboresScreen / GuiaScreen)
      // ==========================================
      if (estructurado.programa_fertilizacion) {
        if (typeof estructurado.programa_fertilizacion === 'object' && estructurado.programa_fertilizacion.etapas) {
            estructurado.programa_fertilizacion = Object.entries(estructurado.programa_fertilizacion.etapas).map(([etapa, detalles]) => ({
              etapa: etapa,
              detalles: typeof detalles === 'string' ? detalles : JSON.stringify(detalles),
              dosis_base: estructurado.programa_fertilizacion.dosis_npk || 'No especificada'
            }));
        } else {
            estructurado.programa_fertilizacion = this._normalizarLista(estructurado.programa_fertilizacion);
        }
      } else {
        estructurado.programa_fertilizacion = [];
      }

      if (estructurado.calendario_riego_mensual) {
        if (typeof estructurado.calendario_riego_mensual === 'object' && estructurado.calendario_riego_mensual.calendario_riego) {
            estructurado.calendario_riego = this._normalizarLista(estructurado.calendario_riego_mensual.calendario_riego);
        } else {
            estructurado.calendario_riego = this._normalizarLista(estructurado.calendario_riego_mensual);
        }
      }

      if (estructurado.alertas_riesgos) {
        if (Array.isArray(estructurado.alertas_riesgos)) {
            estructurado.alertas_riesgos = estructurado.alertas_riesgos.filter(Boolean);
        } else if (this._isFirebaseMutatedArray(estructurado.alertas_riesgos)) {
            estructurado.alertas_riesgos = Object.values(estructurado.alertas_riesgos).filter(Boolean);
        } else if (typeof estructurado.alertas_riesgos === 'object') {
            let alertasArray = [];
            Object.entries(estructurado.alertas_riesgos).forEach(([categoria, subcategorias]) => {
                if (typeof subcategorias === 'object' && subcategorias !== null && !Array.isArray(subcategorias)) {
                    Object.entries(subcategorias).forEach(([riesgoNombre, detalles]) => {
                        alertasArray.push({
                            tipo: categoria,
                            riesgo: riesgoNombre,
                            impacto: detalles.impacto || 'No especificado',
                            mitigacion: detalles.mitigacion || detalles.prevencion || 'Sin plan de mitigación'
                        });
                    });
                } else if (typeof subcategorias === 'string') {
                    // Blindaje si la subcategoría es un string plano
                    alertasArray.push({
                        tipo: categoria,
                        riesgo: categoria,
                        impacto: 'Variable',
                        mitigacion: subcategorias
                    });
                }
            });
            estructurado.alertas_riesgos = alertasArray;
        }
      } else {
        estructurado.alertas_riesgos = [];
      }

      if (estructurado.conclusiones_recomendaciones) {
        estructurado.conclusiones_recomendaciones = this._normalizarLista(estructurado.conclusiones_recomendaciones)
            .map(item => typeof item === 'string' ? item : JSON.stringify(item));
      }

      // ==========================================
      // 5. MISCELÁNEOS
      // ==========================================
      if (data.sistemas_recomendados?.sistemas_riego) {
        estructurado.sistemas_riego = this._normalizarLista(data.sistemas_recomendados.sistemas_riego);
      } else if (data.sistemas_riego) {
        estructurado.sistemas_riego = this._normalizarLista(data.sistemas_riego);
      }

      if (data.recursos_asistencia?.instituciones) {
        estructurado.instituciones = this._normalizarLista(data.recursos_asistencia.instituciones);
      }

      estructurado.nombre_cientifico = data.nombre_cientifico || data.nombre_botanico || "No disponible";
      
      return estructurado;
    } catch (error) {
      console.error("❌ Error CRÍTICO en _prepararEstructura:", error);
      return data; // Fallback de emergencia
    }
  }

  // ==========================================
  // CONEXIONES DE RED Y CACHÉ
  // ==========================================
  async obtenerCultivo(nombreCultivo, nivelRequerido = 'completo', forzarActualizacion = false) {
    const cacheKey = `cultivo_${nombreCultivo}_${nivelRequerido}`;

    if (!forzarActualizacion) {
      try {
        const cachedData = await AsyncStorage.getItem(cacheKey);
        if (cachedData) {
          return JSON.parse(cachedData);
        }
      } catch (e) {
        console.warn("Error en caché", e);
      }
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
    } catch (error) {
      console.log("⚠️ Modo Offline o Error de Red:", error.message);
    }

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
    if (datosBasicosLocal && datosBasicosLocal.cultivos) {
      return Object.keys(datosBasicosLocal.cultivos);
    }
    return [];
  }
}

export default new CultivoDataManager();