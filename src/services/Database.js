import * as SQLite from 'expo-sqlite';
import NetInfo from "@react-native-community/netinfo";
// Asegúrate de que la ruta apunte a donde tienes tu inicialización de Supabase
import { supabase } from './supabaseClient'; 

// Abre o crea la base de datos local de forma síncrona
//const db = SQLite.openDatabaseSync('roslinapp_offline.db');

/**
 * INICIALIZACIÓN DE LA BASE DE DATOS LOCAL
 * Se llama desde App.js al arrancar la aplicación.
 */

// Función para obtener la DB solo cuando se necesita
const getDb = () => {
  return SQLite.openDatabaseSync('roslinapp_offline.db');
};

export const inicializarBaseDeDatos = () => {
  try {
    const db = getDb();
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
  if (!pregunta) return "Disculpa, no alcancé a escuchar bien la pregunta.";

  const db = getDb();
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

    const db = getDb();

    console.log("Descargando datos de cultivos desde Supabase...");

    // 1. Descargamos la tabla real 'cultivos' con las columnas correctas
    const { data: cultivos, error } = await supabase
      .from('cultivos')
      .select('nombre, programa_fertilizacion, plagas_resumen, sistemas_riego, economia_expandida');

    if (error) throw error;
    if (!cultivos || cultivos.length === 0) return;

    // 2. Preparamos la inserción en la base de datos local
    const statement = db.prepareSync('INSERT INTO conocimiento_agricola (cultivo, tema, pregunta_comun, respuesta) VALUES (?, ?, ?, ?)');
    
    db.withTransactionSync(() => {
      db.execSync('DELETE FROM conocimiento_agricola;'); // Limpiamos la caché anterior
      
      for (const cultivo of cultivos) {
        const nombreCultivo = cultivo.nombre;

        // Parseo seguro de los JSONs individuales
        const fertilizacion = typeof cultivo.programa_fertilizacion === 'string' ? JSON.parse(cultivo.programa_fertilizacion) : cultivo.programa_fertilizacion;
        const plagas = typeof cultivo.plagas_resumen === 'string' ? JSON.parse(cultivo.plagas_resumen) : cultivo.plagas_resumen;
        const riego = typeof cultivo.sistemas_riego === 'string' ? JSON.parse(cultivo.sistemas_riego) : cultivo.sistemas_riego;
        const eco = typeof cultivo.economia_expandida === 'string' ? JSON.parse(cultivo.economia_expandida) : cultivo.economia_expandida;

        // A. Nutrición y Fertilizantes
        if (fertilizacion && fertilizacion.length > 0) {
          const resumenFert = fertilizacion.map(f => `${f.dosis_kg_ha} kg/ha de la fórmula ${f.formula} en etapa de ${f.etapa}`).join(', ');
          const respuestaNutricion = `Para el cultivo de ${nombreCultivo}, se sugiere aplicar: ${resumenFert}.`;
          statement.executeSync([nombreCultivo, 'Nutrición', `¿Cuánto fertilizante necesita el ${nombreCultivo}?`, respuestaNutricion]);
        }

        // B. Plagas y Enfermedades
        if (plagas && plagas.length > 0) {
          const listaPlagas = plagas.map(p => `${p.nombre}, que ${p.descripcion ? p.descripcion.toLowerCase() : 'afecta el cultivo'}`).join('. También ataca ');
          const respuestaPlagas = `Las plagas principales del ${nombreCultivo} son: ${listaPlagas}.`;
          statement.executeSync([nombreCultivo, 'Plagas', `¿Qué plagas atacan al ${nombreCultivo}?`, respuestaPlagas]);
        }

        // C. Riego
        if (riego && riego.length > 0) {
          const sis = riego[0];
          const respuestaRiego = `Se recomienda sistema por ${sis.sistema} con una lámina anual de ${sis.lamina_anual_mm} milímetros.`;
          statement.executeSync([nombreCultivo, 'Riego', `¿Cuánta agua ocupa el ${nombreCultivo}?`, respuestaRiego]);
        }
        
        // D. Mercado y Economía
        if (eco) {
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