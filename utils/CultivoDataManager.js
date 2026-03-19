import AsyncStorage from '@react-native-async-storage/async-storage';
import datosBasicosLocal from '../data/cultivos_basico.json'; 

const FIREBASE_URL = "https://cultivos-d97e2-default-rtdb.firebaseio.com";

class CultivoDataManager {

  /**
   * HELPER: Convierte Objetos de Firebase a Arrays
   * Evita crashes cuando Firebase devuelve un objeto en lugar de una lista
   */
  _normalizarArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    // Si es un objeto (comportamiento común de Firebase), extrae los valores
    return Object.values(data);
  }

  /**
   * VALIDADOR: Verifica que el objeto tenga las llaves mínimas para no crashear las pantallas
   */
  _validarDatosMinimos(data) {
    const llavesRequeridas = ['_nivel', 'nombre_cientifico']; 
    for (const llave of llavesRequeridas) {
      if (!data[llave]) {
        throw new Error(`Falta la llave requerida: ${llave}`);
      }
    }
    return true;
  }

  /**
   * Procesa y limpia la estructura del cultivo antes de enviarlo a las pantallas
   */
  _prepararEstructura(data) {
    try {
      if (!data) return null;

      // 1. Validación de integridad
      this._validarDatosMinimos(data);

      // Clonamos para evitar mutar el original
      const cleanedData = { ...data };

      // 2. Normalización de Sistemas de Riego
      if (cleanedData.sistemas_riego) {
        cleanedData.sistemas_riego = this._normalizarArray(cleanedData.sistemas_riego);
      }
      if (cleanedData.sistemas_recomendados?.sistemas_riego) {
        cleanedData.sistemas_recomendados.sistemas_riego = this._normalizarArray(cleanedData.sistemas_recomendados.sistemas_riego);
      }

      // 3. Normalización de Plagas y Enfermedades (Firebase Object to Array)
      if (cleanedData.plagas_enfermedades) {
        cleanedData.plagas_enfermedades = this._normalizarArray(cleanedData.plagas_enfermedades);
      }

      // 4. Normalización de Alertas/Riesgos
      if (cleanedData.alertas_riesgos) {
        cleanedData.alertas_riesgos = this._normalizarArray(cleanedData.alertas_riesgos);
      }

      // 5. Limpieza de URLs de imágenes (Convierte __ en / si es necesario)
      if (cleanedData.imagen_url && typeof cleanedData.imagen_url === 'string') {
        cleanedData.imagen_url = cleanedData.imagen_url.replace(/__/g, '/');
      }

      return cleanedData;

    } catch (error) {
      console.error("❌ [CultivoDataManager] Error validando estructura de datos:", error.message);
      // Si los datos están corruptos o incompletos, retornamos null para que la pantalla maneje el error
      // y no se guarde información basura en AsyncStorage.
      return null;
    }
  }

  /**
   * Obtiene los datos de un cultivo (Caché -> Firebase -> Local)
   */
  async obtenerCultivo(nombreCultivo, nivelRequerido = 'basico', forceRefresh = false) {
    const CACHE_KEY = `@cultivo_data_${nombreCultivo}`;

    // 1. BUSCAR EN CACHÉ (Si no se requiere refresco forzado)
    if (!forceRefresh) {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (nivelRequerido === 'basico' || parsed._nivel === 'completo') {
            return parsed;
          }
        }
      } catch (e) {
        console.log("⚠️ Error leyendo caché", e);
      }
    }

    // 2. BUSCAR EN FIREBASE (Datos completos)
    try {
      const response = await fetch(`${FIREBASE_URL}/cultivos/${nombreCultivo}.json`);
      if (response.ok) {
        const data = await response.json();
        if (data) {
          const processedData = this._prepararEstructura(data);
          
          // Solo guardamos en caché si pasó la validación de _prepararEstructura
          if (processedData) {
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(processedData));
            return processedData;
          }
        }
      } else {
        console.log(`⚠️ Error HTTP: ${response.status}`);
      }
    } catch (error) {
      console.log("⚠️ [OFFLINE] Error de red o fetch fallido. Usando respaldo local.", error.message);
    }

    // 3. FALLBACK: DATOS BÁSICOS LOCALES (cultivos_basico.json)
    if (datosBasicosLocal && datosBasicosLocal.cultivos) {
      const nombreNorm = nombreCultivo.charAt(0).toUpperCase() + nombreCultivo.slice(1);
      const dataLocal = datosBasicosLocal.cultivos[nombreCultivo] || datosBasicosLocal.cultivos[nombreNorm];
      
      if (dataLocal) {
        const processedLocal = this._prepararEstructura(dataLocal);
        if (processedLocal) {
          return { 
            ...processedLocal, 
            _origen: 'local_basico',
            _nivel: 'basico' 
          };
        }
      }
    }

    return null;
  }

  /**
   * Devuelve la lista de nombres de cultivos disponibles en el archivo local
   */
  obtenerListaBasica() {
    if (datosBasicosLocal && datosBasicosLocal.cultivos) {
      return Object.keys(datosBasicosLocal.cultivos);
    }
    return [];
  }

  /**
   * Limpia la caché de un cultivo específico
   */
  async limpiarCache(nombreCultivo) {
    try {
      await AsyncStorage.removeItem(`@cultivo_data_${nombreCultivo}`);
      return true;
    } catch (e) {
      return false;
    }
  }
}

export default new CultivoDataManager();