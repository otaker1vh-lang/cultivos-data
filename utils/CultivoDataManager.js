import AsyncStorage from '@react-native-async-storage/async-storage';
import datosBasicosLocal from '../data/cultivos_basico.json'; 

const FIREBASE_URL = "https://cultivos-d97e2-default-rtdb.firebaseio.com";

class CultivoDataManager {

  /**
   * MANTENIDO: Convierte Objetos de Firebase a Arrays
   */
  _normalizarArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return Object.values(data);
  }

  /**
   * MANTENIDO: Verifica llaves mínimas. 
   * Se ajustó para ser más flexible si 'nombre_cientifico' viene vacío.
   */
  _validarDatosMinimos(data) {
    if (!data || !data._nivel) {
      return false;
    }
    return true;
  }

  /**
   * MANTENIDO Y MEJORADO: Procesa la estructura para GuiaScreen.js
   * Actúa como NORMALIZADOR CENTRAL para limpiar inconsistencias del JSON.
   */
  _prepararEstructura(data) {
    try {
      if (!data) return null;

      // Creamos una copia para transformar los datos sin perder los originales
      let estructurado = { ...data };

      // ==========================================
      // INICIO DEL NORMALIZADOR CENTRAL
      // ==========================================

      // 1. NORMALIZAR RIESGOS DETALLADOS (Previene Crashes en PlagasScreen)
      if (estructurado.riesgos_detallados) {
        let riesgosArray = [];
        if (!Array.isArray(estructurado.riesgos_detallados)) {
          riesgosArray = Object.entries(estructurado.riesgos_detallados).map(([nombre, detalles]) => ({
            nombre_plaga: nombre,
            ...detalles
          }));
        } else {
          riesgosArray = [...estructurado.riesgos_detallados];
        }

        estructurado.riesgos_detallados = riesgosArray.map(plaga => {
          // Si no tiene el objeto control (Esquema B), lo fabricamos a partir de los arrays sueltos
          let controlNormalizado = plaga.control;
          if (!controlNormalizado) {
            controlNormalizado = {
              mecanismo: plaga.control_quimico 
                ? (Array.isArray(plaga.control_quimico) ? plaga.control_quimico.join(', ') : plaga.control_quimico) 
                : 'No especificado',
              biologico: plaga.control_biologico || 'No especificado',
              productos_activos_mexico: []
            };
          }

          return {
            ...plaga,
            control: controlNormalizado,
            // Aseguramos que existan los objetos de desarrollo para los cálculos de GDD
            ciclo_desarrollo: plaga.ciclo_desarrollo || { gdd_ciclo_completo: null, notas: 'No disponible' },
            condiciones_desarrollo: plaga.condiciones_desarrollo || { temperatura_optima: 'No disponible' }
          };
        });
      }

      // 2. NORMALIZAR PROGRAMA DE FERTILIZACIÓN (Previene Crashes en LaboresScreen)
      if (estructurado.programa_fertilizacion) {
        if (!Array.isArray(estructurado.programa_fertilizacion)) {
          // Si es un objeto con sub-nodo 'etapas', lo aplanamos a un Array de objetos
          if (estructurado.programa_fertilizacion.etapas) {
            estructurado.programa_fertilizacion = Object.entries(estructurado.programa_fertilizacion.etapas).map(([etapa, detalles]) => ({
              etapa: etapa,
              detalles: typeof detalles === 'string' ? detalles : JSON.stringify(detalles),
              dosis_base: estructurado.programa_fertilizacion.dosis_npk || 'No especificada'
            }));
          } else {
            // Si es un objeto suelto sin etapas, lo metemos en un array
            estructurado.programa_fertilizacion = [estructurado.programa_fertilizacion];
          }
        }
      } else {
        estructurado.programa_fertilizacion = [];
      }

      // 3. NORMALIZAR ALERTAS Y RIESGOS (Previene Tarjetas Vacías en GuiaScreen)
      if (estructurado.alertas_riesgos) {
        if (!Array.isArray(estructurado.alertas_riesgos)) {
          // Formato anómalo: objeto categorizado (ej. { climaticas: {...}, economicas: {...} })
          let alertasArray = [];
          Object.entries(estructurado.alertas_riesgos).forEach(([categoria, subcategorias]) => {
            if (typeof subcategorias === 'object' && subcategorias !== null) {
              Object.entries(subcategorias).forEach(([riesgoNombre, detalles]) => {
                alertasArray.push({
                  tipo: categoria,
                  riesgo: riesgoNombre,
                  impacto: detalles.impacto || 'No especificado',
                  mitigacion: detalles.mitigacion || detalles.prevencion || 'Sin plan de mitigación',
                  probabilidad: detalles.probabilidad || 'Desconocida'
                });
              });
            }
          });
          estructurado.alertas_riesgos = alertasArray;
        }
      } else {
        estructurado.alertas_riesgos = [];
      }

      // 4. NORMALIZAR CONCLUSIONES Y RECOMENDACIONES (Previene Error de .map en GuiaScreen)
      if (estructurado.conclusiones_recomendaciones) {
        if (!Array.isArray(estructurado.conclusiones_recomendaciones)) {
          // Si es un objeto de perspectivas, convertimos sus valores a un array de strings
          estructurado.conclusiones_recomendaciones = Object.values(estructurado.conclusiones_recomendaciones)
            .map(item => typeof item === 'string' ? item : JSON.stringify(item));
        }
      } else {
        estructurado.conclusiones_recomendaciones = [];
      }

      // 5. NORMALIZAR PRINCIPALES ESTADOS (Previene Barras Rotas o NaN en EstadisticasScreen)
      if (estructurado.detalle_produccion_nacional?.principales_estados) {
        let estados = estructurado.detalle_produccion_nacional.principales_estados;
        if (!Array.isArray(estados) && typeof estados === 'object') {
           estados = Object.values(estados);
        }
        if (Array.isArray(estados)) {
            estructurado.detalle_produccion_nacional.principales_estados = estados.map(estado => ({
               ...estado,
               rendimiento_t_ha: typeof estado.rendimiento_t_ha === 'number' ? estado.rendimiento_t_ha : 0,
               superficie_ha: typeof estado.superficie_ha === 'number' ? estado.superficie_ha : 0,
               participacion_pct: typeof estado.participacion_pct === 'number' ? estado.participacion_pct : 0
            }));
        }
      }

      // 6. NORMALIZAR DESTINOS PRINCIPALES DE EXPORTACIÓN (Previene [object Object] en EstadisticasScreen)
      if (estructurado.mercado_comercializacion?.destinos_principales) {
        let destinos = estructurado.mercado_comercializacion.destinos_principales;
        if (Array.isArray(destinos)) {
           estructurado.mercado_comercializacion.destinos_principales = destinos.map(destino => {
              // Si viene como Array de Strings, lo convertimos a Objeto
              if (typeof destino === 'string') {
                 // Intenta extraer el porcentaje si viene como "Estados Unidos (80%)"
                 const match = destino.match(/(.+?)\s*\(([\d.]+)%\)/);
                 if (match) {
                    return { destino: match[1].trim(), porcentaje: parseFloat(match[2]) };
                 }
                 return { destino: destino, porcentaje: null };
              }
              // Si ya es objeto, aseguramos que tenga la propiedad 'destino'
              return { destino: destino.destino || destino.pais || "Desconocido", porcentaje: destino.porcentaje || null };
           });
        }
      }

      // ==========================================
      // FIN DEL NORMALIZADOR CENTRAL
      // ==========================================

      // 7. SOPORTE PARA RIEGO (Busca en la nueva ruta del JSON científico)
      if (data.sistemas_recomendados?.sistemas_riego) {
        estructurado.sistemas_riego = this._normalizarArray(data.sistemas_recomendados.sistemas_riego);
      } else if (data.sistemas_riego) {
        estructurado.sistemas_riego = this._normalizarArray(data.sistemas_riego);
      }

      // 8. SOPORTE PARA INSTITUCIONES
      if (data.recursos_asistencia?.instituciones) {
        estructurado.instituciones = this._normalizarArray(data.recursos_asistencia.instituciones);
      }

      // 9. ASEGURAR NOMBRES (Compatibilidad con GuiaScreen)
      estructurado.nombre_cientifico = data.nombre_cientifico || data.nombre_botanico || "No disponible";
      
      return estructurado;
    } catch (error) {
      console.error("❌ Error en _prepararEstructura:", error);
      // Fallback: Si el normalizador falla catastróficamente, devuelve los datos crudos
      return data;
    }
  }

  /**
   * MANTENIDO: Lógica de Cache -> Firebase -> Local
   */
  async obtenerCultivo(nombreCultivo, nivelRequerido = 'completo', forzarActualizacion = false) {
    const cacheKey = `cultivo_${nombreCultivo}_${nivelRequerido}`;

    // 1. Intentar desde AsyncStorage
    if (!forzarActualizacion) {
      try {
        const cachedData = await AsyncStorage.getItem(cacheKey);
        if (cachedData) {
          console.log(`🚀 ${nombreCultivo} cargado de caché`);
          return JSON.parse(cachedData);
        }
      } catch (e) {
        console.warn("Error en caché", e);
      }
    }

    // 2. Intentar desde Firebase (Realtime Database)
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

    // 3. MANTENIDO: Fallback a JSON Local
    if (datosBasicosLocal?.cultivos) {
      const nombreNorm = nombreCultivo.charAt(0).toUpperCase() + nombreCultivo.slice(1);
      const dataLocal = datosBasicosLocal.cultivos[nombreCultivo] || datosBasicosLocal.cultivos[nombreNorm];
      
      if (dataLocal) {
        const processedLocal = this._prepararEstructura(dataLocal);
        return { 
          ...processedLocal, 
          _origen: 'local_basico',
          _nivel: dataLocal._nivel || 'basico' 
        };
      }
    }

    return null;
  }

  /**
   * MANTENIDO: Obtiene lista para buscadores
   */
  obtenerListaBasica() {
    if (datosBasicosLocal && datosBasicosLocal.cultivos) {
      return Object.keys(datosBasicosLocal.cultivos);
    }
    return [];
  }
}

export default new CultivoDataManager();