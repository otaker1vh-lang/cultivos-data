import * as SQLite from 'expo-sqlite';
import NetInfo from "@react-native-community/netinfo";
// Asegúrate de que la ruta apunte a donde tienes tu inicialización de Supabase
import { supabase } from './supabaseClient'; 

// Abre o crea la base de datos local de forma síncrona
const db = SQLite.openDatabaseSync('roslinapp_offline.db');

/**
 * INICIALIZACIÓN DE LA BASE DE DATOS LOCAL
 * Se llama desde App.js al arrancar la aplicación.
 */
export const inicializarBaseDeDatos = () => {
  try {
    // FTS5 es ideal para búsquedas de texto ignorando errores ortográficos menores
    db.execSync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS conocimiento_agricola USING fts5(
        cultivo, 
        tema, 
        pregunta_comun, 
        respuesta
      );
    `);
    console.log("Base de datos local inicializada correctamente.");
  } catch (error) {
    console.error("Error al inicializar la base de datos SQLite:", error);
  }
};

/**
 * MOTOR DE BÚSQUEDA OFFLINE (RAG LOCAL)
 * Se ejecuta en AsistenteVoz.js cuando no hay internet.
 */
export const buscarRespuestaOffline = (pregunta, cultivoActual) => {
  if (!pregunta) return "Patrón, no alcancé a escuchar bien la pregunta.";

  // Limpiamos la pregunta de signos y creamos un formato de búsqueda FTS (palabra OR palabra)
  const palabrasClave = pregunta
    .replace(/[¿?¡!.,]/g, '')
    .trim()
    .split(' ')
    .filter(palabra => palabra.length > 3) // Ignorar conectores cortos como "el", "la", "de"
    .join(' OR ');
  
  if (!palabrasClave) {
    return "Patrón, su consulta fue muy corta. ¿Podría darme más detalles?";
  }

  // MATCH busca en todas las columnas de la tabla virtual. Limitamos a la mejor coincidencia.
  const query = `
    SELECT respuesta FROM conocimiento_agricola 
    WHERE conocimiento_agricola MATCH ? AND cultivo = ?
    ORDER BY rank LIMIT 1;
  `;
  
  try {
    const resultado = db.getFirstSync(query, [palabrasClave, cultivoActual]);
    
    if (resultado && resultado.respuesta) {
      return resultado.respuesta;
    } else {
      return "Patrón, no encontré esa información exacta en el manual guardado. Necesitaremos algo de señal para consultar el sistema principal.";
    }
  } catch (error) {
    console.error("Error en búsqueda offline:", error);
    return "Hubo un error revisando los apuntes locales. Intente con otras palabras.";
  }
};

/**
 * SINCRONIZACIÓN CON SUPABASE
 * Descarga los datos de la nube y reemplaza la caché local.
 */
export const sincronizarConocimiento = async () => {
  try {
    const red = await NetInfo.fetch();
    if (!red.isConnected || !red.isInternetReachable) return;

    console.log("Descargando datos de cultivos desde Supabase...");

    // 1. Descargamos tu tabla actual
    const { data: cultivos, error } = await supabase
      .from('tabla_cultivos') // Ajusta el nombre si en Supabase se llama diferente
      .select('nombre, datos_completos');

    if (error) throw error;
    if (!cultivos || cultivos.length === 0) return;

    // 2. Preparamos la inserción en la base de datos local
    const statement = db.prepareSync('INSERT INTO conocimiento_agricola (cultivo, tema, pregunta_comun, respuesta) VALUES (?, ?, ?, ?)');
    
    db.withTransactionSync(() => {
      db.execSync('DELETE FROM conocimiento_agricola;'); // Limpiamos la caché anterior
      
      for (const cultivo of cultivos) {
        // Aseguramos que el JSON sea un objeto (por si viene como string)
        const info = typeof cultivo.datos_completos === 'string' 
          ? JSON.parse(cultivo.datos_completos) 
          : cultivo.datos_completos;

        const nombreCultivo = cultivo.nombre || info.cultivo;

        // --- EXTRACCIÓN Y ENRIQUECIMIENTO PARA EL ASISTENTE ---
        // Aquí "aplanamos" el JSON en oraciones que el asistente pueda leer en voz alta.

        // A. Nutrición y Fertilizantes
        if (info.fertilizacion?.requerimientos_anuales) {
          const req = info.fertilizacion.requerimientos_anuales;
          const respuestaNutricion = `Para el cultivo de ${nombreCultivo}, se requieren ${req.N_kg_ha} kilos de nitrógeno, ${req.P2O5_kg_ha} de fósforo y ${req.K2O_kg_ha} de potasio por hectárea.`;
          statement.executeSync([nombreCultivo, 'Nutrición', `¿Cuánto fertilizante necesita el ${nombreCultivo}?`, respuestaNutricion]);
        }

        // B. Plagas y Enfermedades
        if (info.plagas_resumen && info.plagas_resumen.length > 0) {
          const listaPlagas = info.plagas_resumen.map(p => `${p.nombre}, que ${p.descripcion.toLowerCase()}`).join('. También ataca ');
          const respuestaPlagas = `Las plagas principales del ${nombreCultivo} son: ${listaPlagas}.`;
          statement.executeSync([nombreCultivo, 'Plagas', `¿Qué plagas atacan al ${nombreCultivo}?`, respuestaPlagas]);
        }

        // C. Riego
        if (info.riego?.requerimiento_hidrico) {
          const agua = info.riego.requerimiento_hidrico;
          const respuestaRiego = `El requerimiento hídrico es de ${agua.lamina_total_anual_mm} milímetros anuales.`;
          statement.executeSync([nombreCultivo, 'Riego', `¿Cuánta agua ocupa el ${nombreCultivo}?`, respuestaRiego]);
        }
        
        // D. Mercado y Economía
        if (info.estadisticas?.economia) {
          const eco = info.estadisticas.economia;
          const respuestaEco = `La época de mejor precio es de ${eco.epoca_mejor_precio}. El precio máximo ronda los ${eco.precio_max_mxn_ton} pesos por tonelada.`;
          statement.executeSync([nombreCultivo, 'Economía', `¿A cómo se vende el ${nombreCultivo}?`, respuestaEco]);
        }
      }
    });
    
    statement.finalizeSync();
    console.log("Datos de cultivos procesados y listos para el Asistente Offline.");

  } catch (error) {
    console.error("Error al procesar el JSON de cultivos:", error);
  }
};