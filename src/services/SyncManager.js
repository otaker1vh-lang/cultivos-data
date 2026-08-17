// src/services/SyncManager.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from "@react-native-community/netinfo";
import { supabase } from './supabaseClient'; // Asegúrate de que esta ruta apunte a tu cliente
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';

export class SyncManager {
  static isSyncing = false;

  /**
   * Inicia el "escuchador" de red. Llámalo una vez al abrir la app.
   */
  static iniciarListener() {
    NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        console.log("🟢 Red detectada. Iniciando sincronización silenciosa...");
        this.sincronizarBitacorasPendientes();
        this.procesarDiagnosticosPendientes();
      }
    });
  }

  /**
   * Lee el AsyncStorage, busca registros pendientes y los envía a Supabase.
   */
  static async sincronizarBitacorasPendientes() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // 1. Obtener todas las llaves del AsyncStorage que corresponden a bitácoras
      const todasLasLlaves = await AsyncStorage.getAllKeys();
      const llavesBitacoras = todasLasLlaves.filter(key => key.startsWith('@bitacora_v4_fotos_'));

      if (llavesBitacoras.length === 0) {
        this.isSyncing = false;
        return;
      }

      // 2. Extraer todos los registros de todos los cultivos
      let todosLosRegistros = [];
      for (const key of llavesBitacoras) {
        const dataRaw = await AsyncStorage.getItem(key);
        if (dataRaw) {
          const registros = JSON.parse(dataRaw);
          // Le inyectamos la llave de origen para saber de dónde vino y poder actualizarlo luego
          const registrosConLlave = registros.map(r => ({ ...r, _storageKey: key }));
          todosLosRegistros = [...todosLosRegistros, ...registrosConLlave];
        }
      }

      // 3. Filtrar solo los que NO están sincronizados
      // Asumimos que si no tiene la propiedad 'sincronizado', es false (pendiente)
      const pendientes = todosLosRegistros.filter(r => r.sincronizado !== true);

      if (pendientes.length === 0) {
        this.isSyncing = false;
        return;
      }

      console.log(`📤 Encontrados ${pendientes.length} registros pendientes para sincronizar.`);

      // 4. Preparar el payload para Supabase (ajustando a tu tabla 'bitacora')
      // Mapeamos los campos locales a las columnas de Supabase que creamos en el esquema SQL
      const payloadSupabase = pendientes.map(r => ({
        // Nota: Asumimos que el 'id' local es un timestamp (Date.now()), Supabase generará un UUID nuevo
        lote_id: r.lote_id || null, // DEBES asegurar que el lote_id esté en el AsyncStorage
        fecha_evento: new Date(r.fecha).toISOString(),
        tipo: 'otro', // Un valor por defecto si tu Enum de BD no empata
        transcripcion_original: r.nota,
        datos_estructurados: { 
            nota: r.nota, 
            etapa: r.etapa,
            sincronizado_desde_app: true 
        },
        requiere_recordatorio: false,
        // La imagen en Base64 la podrías subir a Supabase Storage aquí, pero por simplicidad
        // en esta primera versión la omitimos de la tabla relacional.
      }));

      // 5. Enviar a Supabase (Inserción múltiple / Bulk insert)
      const { data, error } = await supabase
        .from('bitacora')
        .insert(payloadSupabase)
        .select();

      if (error) {
        console.error("❌ Error enviando a Supabase:", error);
        throw error;
      }

      console.log("✅ Sincronización exitosa en Supabase.");

      // 6. Si fue exitoso, marcar los registros locales como sincronizados
      for (const key of llavesBitacoras) {
        const dataRaw = await AsyncStorage.getItem(key);
        if (dataRaw) {
          let registros = JSON.parse(dataRaw);
          let modificado = false;

          registros = registros.map(reg => {
             // Si el registro estaba en la lista de pendientes que acabamos de enviar
             if (pendientes.some(p => p.id === reg.id)) {
                 modificado = true;
                 return { ...reg, sincronizado: true };
             }
             return reg;
          });

          // Solo reescribimos el AsyncStorage si hubo cambios
          if (modificado) {
             await AsyncStorage.setItem(key, JSON.stringify(registros));
          }
        }
      }

      console.log("📝 Almacenamiento local actualizado (marcados como sincronizados).");

    } catch (e) {
      console.error("Error en el ciclo de sincronización:", e);
    } finally {
      this.isSyncing = false;
    }
  };

  /**
   * Lee imágenes guardadas sin red, las manda a Gemini y genera notificación Push
   */
  static async procesarDiagnosticosPendientes() {
      try {
          const strPendientes = await AsyncStorage.getItem('@diagnosticos_pendientes');
          if (!strPendientes) return;
          
          let pendientes = JSON.parse(strPendientes);
          if (pendientes.length === 0) return;

          console.log(`🔍 Procesando ${pendientes.length} diagnósticos visuales pendientes...`);

          let restantes = [];

          for (const diag of pendientes) {
              try {
                  // 1. Convertir la URI guardada a Base64
                  const base64Data = await FileSystem.readAsStringAsync(diag.uri, { encoding: 'base64' });

                  // 2. Enviar a Gemini (Supabase)
                  const bodyPayload = { 
                      pregunta: "¿Diagnostica de forma muy breve y exacta qué problema fitosanitario tiene esta planta y dame su nombre científico?", 
                      cultivoActual: diag.cultivo || "General",
                      loteId: diag.loteId,
                      imagenBase64: base64Data
                  };

                  const { data, error } = await supabase.functions.invoke('consultar-asistente', {
                      body: bodyPayload
                  });

                  if (!error && data && data.respuesta) {
                      // 3. Disparar Notificación Push Local con el resultado
                      await Notifications.scheduleNotificationAsync({
                           content: {
                               title: `🌿 Diagnóstico Listo: ${diag.cultivo || 'Campo'}`,
                               body: data.respuesta, // La respuesta de Gemini
                               sound: 'default',
                           },
                           trigger: null, // Disparo inmediato
                      });
                      console.log("✅ Diagnóstico diferido resuelto y notificado.");
                  } else {
                      restantes.push(diag); // Falló, lo mantenemos en la cola
                  }

              } catch(errItem) {
                  console.error("Fallo al procesar un diagnóstico diferido:", errItem);
                  restantes.push(diag);
              }
          }

          // 4. Actualizamos la cola (eliminando los exitosos)
          await AsyncStorage.setItem('@diagnosticos_pendientes', JSON.stringify(restantes));

      } catch (e) {
          console.error("Error general procesando diagnósticos pendientes:", e);
      }
  }

}