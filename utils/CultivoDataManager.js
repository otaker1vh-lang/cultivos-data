import AsyncStorage from '@react-native-async-storage/async-storage';
import datosBasicosLocal from '../data/cultivos_basico.json'; 

const FIREBASE_URL = "https://cultivos-d97e2-default-rtdb.firebaseio.com";

class CultivoDataManager {

  // --- HELPER: Convierte Objetos de Firebase a Arrays ---
  _normalizarArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    // Si es objeto (comportamiento de Firebase con índices numéricos), extrae valores
    return Object.values(data);
  }
  // ------------------------------------------------------------

  // AJUSTE: Eliminado 'static' para permitir uso de 'this' y acceso desde la instancia exportada
  async obtenerCultivo(nombreCultivo, nivel = 'completo') {
    const cacheKey = `@cultivo_data_${nombreCultivo}`;

    // 1. INTENTO CACHÉ
    try {
      const jsonCache = await AsyncStorage.getItem(cacheKey);
      if (jsonCache) {
        const dataCache = JSON.parse(jsonCache);
        if (nivel === 'basico') return dataCache;
        // Aquí podrías agregar lógica para invalidar caché por tiempo si lo deseas
      }
    } catch (e) { console.error("Error lectura caché", e); }

    // 2. INTENTO ONLINE
    try {
      console.log(`🌐 [NUBE] Buscando ${nombreCultivo} en Firebase...`);
      const controller = new AbortController();
      // Timeout de 5 segundos para evitar pantallas de carga infinitas
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${FIREBASE_URL}/cultivos/${nombreCultivo}.json`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        let dataCloud = await response.json();
        
        if (dataCloud) {
          // --- NORMALIZACIÓN DE DATOS ---
          // Usamos 'this._normalizarArray' para corregir estructuras de Firebase
          
          if (dataCloud.estadisticas) {
             // Corregir 'detalle_produccion_nacional'
             //dataCloud.estadisticas.detalle_produccion_nacional = 
             //   this._normalizarArray(dataCloud.estadisticas.detalle_produccion_nacional);
             
             // Si usas historial_produccion como lista en gráficas, normalízalo también:
             // if (dataCloud.estadisticas.historial_produccion) {
             //    dataCloud.estadisticas.historial_produccion = 
             //       this._normalizarArray(dataCloud.estadisticas.historial_produccion);
             // }
          }

          if (dataCloud.mercado_comercializacion) {
             // Corregir canales y destinos
             dataCloud.mercado_comercializacion.canales_venta = 
                this._normalizarArray(dataCloud.mercado_comercializacion.canales_venta);
                
             dataCloud.mercado_comercializacion.destinos_principales = 
                this._normalizarArray(dataCloud.mercado_comercializacion.destinos_principales);
          }
          // -------------------------------------

          console.log("✅ [ÉXITO] Datos descargados, normalizados y guardados.");
          dataCloud._origen = 'nube';
          dataCloud._fecha_actualizacion = new Date().toISOString();
          
          await AsyncStorage.setItem(cacheKey, JSON.stringify(dataCloud));
          return dataCloud;
        }
      }
    } catch (error) {
      console.log("⚠️ [OFFLINE] Falló conexión o timeout...", error);
    }

    // 3. FALLBACK FINAL (Si falló la red, reintentamos leer caché aunque sea viejo)
    try {
        const jsonCache = await AsyncStorage.getItem(cacheKey);
        if (jsonCache) return JSON.parse(jsonCache); 
    } catch (e) {}

    // 4. FALLBACK LOCAL (Datos básicos del JSON local)
    // Aseguramos formato de nombre (primera mayúscula)
    const nombreNormalizado = nombreCultivo.charAt(0).toUpperCase() + nombreCultivo.slice(1).toLowerCase();
    
    // Verificamos que datosBasicosLocal exista para evitar crash
    if (datosBasicosLocal && datosBasicosLocal.cultivos) {
        const dataLocal = datosBasicosLocal.cultivos[nombreNormalizado];
        if (dataLocal) return { ...dataLocal, _origen: 'local_basico' };
    }

    return null;
  }

  obtenerListaBasica() {
    if (datosBasicosLocal && datosBasicosLocal.cultivos) {
        return Object.values(datosBasicosLocal.cultivos);
    }
    return [];
  }
}

// Exportamos la INSTANCIA única
const cultivoDataManager = new CultivoDataManager();
export default cultivoDataManager;