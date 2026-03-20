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
   * Ahora soporta la jerarquía del nuevo JSON Maestro.
   */
  _prepararEstructura(data) {
    try {
      if (!data) return null;

      // Creamos una copia para transformar los datos sin perder los originales
      let estructurado = { ...data };

      // 1. SOPORTE PARA RIESGOS (De Objeto a Array para .map() en GuiaScreen)
      if (data.riesgos_detallados && !Array.isArray(data.riesgos_detallados)) {
        estructurado.riesgos_detallados = Object.entries(data.riesgos_detallados).map(([nombre, detalles]) => ({
          nombre_plaga: nombre,
          ...detalles
        }));
      }

      // 2. SOPORTE PARA RIEGO (Busca en la nueva ruta del JSON científico)
      if (data.sistemas_recomendados?.sistemas_riego) {
        estructurado.sistemas_riego = this._normalizarArray(data.sistemas_recomendados.sistemas_riego);
      } else {
        estructurado.sistemas_riego = this._normalizarArray(data.sistemas_riego);
      }

      // 3. SOPORTE PARA INSTITUCIONES
      if (data.recursos_asistencia?.instituciones) {
        estructurado.instituciones = this._normalizarArray(data.recursos_asistencia.instituciones);
      }

      // 4. ASEGURAR NOMBRES (Compatibilidad con GuiaScreen)
      estructurado.nombre_cientifico = data.nombre_cientifico || data.nombre_botanico || "No disponible";
      
      return estructurado;
    } catch (error) {
      console.error("❌ Error en _prepararEstructura:", error);
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