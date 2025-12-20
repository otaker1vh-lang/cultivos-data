import AsyncStorage from '@react-native-async-storage/async-storage';
import datosBasicos from '../data/cultivos_basico.json'; // Tu archivo local de respaldo

// URL directa al archivo completado en tu repositorio de GitHub
const GITHUB_URL = 'https://raw.githubusercontent.com/TU_USUARIO/TU_REPO/main/data/cultivos_expandido_ia_completado.json'; 
const CACHE_KEY = '@cultivos_completos_cache';

class CultivoDataManager {
    /**
     * Obtiene los datos de un cultivo específico.
     * @param {string} nombre - Nombre del cultivo (ej: "Durazno").
     * @param {string} nivel - 'basico' o 'completo'.
     */
    static async obtenerCultivo(nombre, nivel = 'basico') {
        try {
            if (nivel === 'basico') {
                return { ...datosBasicos.cultivos[nombre], _nivel: 'basico' } || null;
            }

            // Intentar obtener de la caché local primero (AsyncStorage)
            const cache = await AsyncStorage.getItem(CACHE_KEY);
            if (cache) {
                const dataCache = JSON.parse(cache);
                if (dataCache[nombre]) {
                    // Verificamos si los datos tienen la estructura completa
                    return { ...dataCache[nombre], _nivel: 'completo' };
                }
            }

            // Si no está en caché o se requiere actualización, descargar de GitHub
            return await this.descargarYActualizar(nombre);

        } catch (error) {
            console.error("Error en CultivoDataManager:", error);
            // Fallback: Si todo falla, devolver al menos el básico
            return datosBasicos.cultivos[nombre] ? { ...datosBasicos.cultivos[nombre], _nivel: 'basico' } : null;
        }
    }

    /**
     * Descarga el archivo masivo de GitHub y actualiza la caché local.
     */
    static async descargarYActualizar(nombreEspecifico = null) {
        try {
            console.log("Descargando base de datos completa desde GitHub...");
            const respuesta = await fetch(GITHUB_URL);
            const dataCompleta = await respuesta.json();

            if (dataCompleta.cultivos) {
                // Guardar todo el objeto 'cultivos' en caché para futuras consultas rápidas
                await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(dataCompleta.cultivos));
                console.log("Caché de cultivos actualizada exitosamente.");

                if (nombreEspecifico && dataCompleta.cultivos[nombreEspecifico]) {
                    return { ...dataCompleta.cultivos[nombreEspecifico], _nivel: 'completo' };
                }
            }
            return null;
        } catch (error) {
            console.error("Error descargando desde GitHub:", error);
            throw error;
        }
    }

    /**
     * Limpia la caché para forzar una nueva descarga (útil para el botón 'Recargar').
     */
    static async limpiarCache() {
        try {
            await AsyncStorage.removeItem(CACHE_KEY);
            console.log("Caché eliminada.");
        } catch (error) {
            console.error("Error limpiando caché:", error);
        }
    }
}

export default CultivoDataManager;