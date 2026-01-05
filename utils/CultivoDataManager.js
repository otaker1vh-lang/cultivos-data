import AsyncStorage from '@react-native-async-storage/async-storage';
import datosBasicosLocal from '../data/cultivos_basico.json'; 

// 👇 TU URL DE FIREBASE (Asegúrate de que sea correcta)
const FIREBASE_URL = "https://cultivos-d97e2-default-rtdb.firebaseio.com";

class CultivoDataManager {

  /**
   * Obtiene los datos de un cultivo.
   * IMPORTANTE: El nombre es 'obtenerCultivo' para coincidir con tus pantallas.
   */
  async obtenerCultivo(nombreCultivo, nivel = 'completo') {
    const cacheKey = `@cultivo_data_${nombreCultivo}`;

    // ---------------------------------------------------------
    // 1. INTENTO CACHÉ RÁPIDO (Para que la pantalla no parpadee)
    // ---------------------------------------------------------
    try {
      const jsonCache = await AsyncStorage.getItem(cacheKey);
      if (jsonCache) {
        console.log(`📂 [CACHE] Datos encontrados para ${nombreCultivo}`);
        const dataCache = JSON.parse(jsonCache);
        // Si solo piden básico, retornamos caché inmediatamente
        if (nivel === 'basico') return dataCache;
      }
    } catch (e) {
      console.error("Error lectura caché inicial", e);
    }

    // ---------------------------------------------------------
    // 2. INTENTO ONLINE (Si piden completo o no había caché)
    // ---------------------------------------------------------
    try {
      console.log(`🌐 [NUBE] Buscando ${nombreCultivo} en Firebase...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seg timeout

      const response = await fetch(`${FIREBASE_URL}/cultivos/${nombreCultivo}.json`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const dataCloud = await response.json();
        
        if (dataCloud) {
          console.log("✅ [ÉXITO] Datos descargados y guardados.");
          dataCloud._origen = 'nube';
          dataCloud._fecha_actualizacion = new Date().toISOString();
          
          // Guardamos en caché para la próxima
          await AsyncStorage.setItem(cacheKey, JSON.stringify(dataCloud));
          return dataCloud;
        }
      }
    } catch (error) {
      console.log("⚠️ [OFFLINE] Falló conexión, usando modo local.");
    }

    // ---------------------------------------------------------
    // 3. FALLBACK FINAL: Usar el archivo JSON local (Básico)
    // ---------------------------------------------------------
    // Si llegamos aquí es porque falló la red y no queremos devolver null si tenemos algo básico
    try {
        const jsonCache = await AsyncStorage.getItem(cacheKey);
        if (jsonCache) return JSON.parse(jsonCache); // Retorna caché viejo si existe
    } catch (e) {}

    console.log("📦 [LOCAL] Usando datos básicos de emergencia.");
    const dataLocal = datosBasicosLocal.cultivos[nombreCultivo];
    
    if (dataLocal) {
      return { ...dataLocal, _origen: 'local_basico' };
    }

    return null;
  }

  /**
   * Helper para obtener lista simple (Home)
   */
  obtenerListaBasica() {
    return Object.values(datosBasicosLocal.cultivos);
  }
}

// 👇 EXPORTACIÓN LIMPIA: Exportamos una instancia directa
const cultivoDataManager = new CultivoDataManager();
export default cultivoDataManager;