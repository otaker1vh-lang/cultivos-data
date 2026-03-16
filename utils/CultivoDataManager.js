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
   * Procesa y limpia la estructura del cultivo antes de enviarlo a las pantallas
   */
  _prepararEstructura(data) {
    if (!data) return null;

    // Normalización de campos críticos que las pantallas recorren con .map()
    // Ajustado para la estructura MASTER V4
    const cleanedData = { ...data };

    // 1. Sistemas de Riego (pueden estar en la raíz o en sistemas_recomendados)
    if (cleanedData.sistemas_riego) {
      cleanedData.sistemas_riego = this._normalizarArray(cleanedData.sistemas_riego);
    }
    if (cleanedData.sistemas_recomendados?.sistemas_riego) {
      cleanedData.sistemas_recomendados.sistemas_riego = this._normalizarArray(cleanedData.sistemas_recomendados.sistemas_riego);
    }

    // 2. Historial de Producción y Estadísticas
    if (cleanedData.historial_produccion) {
      cleanedData.historial_produccion = this._normalizarArray(cleanedData.historial_produccion);
    }

    // 3. Programas de apoyo e Instituciones
    if (cleanedData.recursos_asistencia?.instituciones) {
      cleanedData.recursos_asistencia.instituciones = this._normalizarArray(cleanedData.recursos_asistencia.instituciones);
    }

    // 4. Asegurar que riesgos/plagas sean iterables
    if (cleanedData.riesgos_detallados) {
      // No normalizamos a Array aquí para mantener las claves (nombres de plagas),
      // pero las pantallas ya están preparadas para usar Object.entries()
    }

    return cleanedData;
  }

  async obtenerCultivo(nombreCultivo, nivel = 'completo') {
    const cacheKey = `@cultivo_data_${nombreCultivo}`;

    // 1. INTENTO LEER CACHÉ
    try {
      const jsonCache = await AsyncStorage.getItem(cacheKey);
      if (jsonCache) {
        const dataCache = JSON.parse(jsonCache);
        // Si ya tenemos datos completos en caché, los devolvemos directamente
        if (nivel === 'basico' || dataCache._nivel === 'completo') {
          return this._prepararEstructura(dataCache);
        }
      }
    } catch (e) { 
      console.error("Error lectura caché:", e); 
    }

    // 2. INTENTO DESCARGAR DE FIREBASE (NUBE)
    try {
      console.log(`🌐 [NUBE] Sincronizando: ${nombreCultivo}...`);
      
      // Ajuste de ruta para estructura MASTER: /cultivos/Nombre Cultivo.json
      const response = await fetch(`${FIREBASE_URL}/cultivos/${nombreCultivo}.json`);
      
      if (response.ok) {
        const dataCloud = await response.json();
        
        if (dataCloud) {
          console.log("✅ [ÉXITO] Datos Master obtenidos y normalizados.");
          
          // Inyectamos metadatos de control
          dataCloud._origen = 'nube';
          dataCloud._fecha_sincronizacion = new Date().toISOString();
          
          // Limpiamos y normalizamos antes de guardar
          const dataFinal = this._prepararEstructura(dataCloud);
          
          // Guardar en caché para uso offline futuro
          await AsyncStorage.setItem(cacheKey, JSON.stringify(dataFinal));
          return dataFinal;
        }
      }
    } catch (error) {
      console.log("⚠️ [OFFLINE] Usando respaldo local por falta de conexión.");
    }

    // 3. FALLBACK: DATOS BÁSICOS LOCALES (cultivos_basico.json)
    // Buscamos en el archivo local que ya viene en el bundle de la App
    if (datosBasicosLocal && datosBasicosLocal.cultivos) {
      // Intentamos coincidencia exacta o con primera mayúscula
      const nombreNorm = nombreCultivo.charAt(0).toUpperCase() + nombreCultivo.slice(1);
      const dataLocal = datosBasicosLocal.cultivos[nombreCultivo] || datosBasicosLocal.cultivos[nombreNorm];
      
      if (dataLocal) {
        return { 
          ...this._prepararEstructura(dataLocal), 
          _origen: 'local_basico',
          _nivel: 'basico' 
        };
      }
    }

    return null;
  }

  /**
   * Devuelve la lista de cultivos disponible en el archivo local
   * Útil para el buscador inicial sin requerir internet
   */
  obtenerListaBasica() {
    if (datosBasicosLocal && datosBasicosLocal.cultivos) {
      return Object.keys(datosBasicosLocal.cultivos);
    }
    return [];
  }

  /**
   * Limpia el caché de un cultivo específico para forzar actualización
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