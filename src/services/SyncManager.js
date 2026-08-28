// src/services/SyncManager.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from "@react-native-community/netinfo";
import { supabase } from './supabaseClient'; 
import * as FileSystem from 'expo-file-system';
import * as Notifications from 'expo-notifications';

export class SyncManager {
  static isSyncing = false;

  static iniciarListener() {
    NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        console.log("🟢 Red detectada. Iniciando sincronización silenciosa...");
        this.ejecutarSincronizacionTotal();
      }
    });
  }

  static async ejecutarSincronizacionTotal() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // 1. Validar identidad (anónima o registrada) indispensable para RLS
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      if (!userId) {
          console.warn("Sincronización abortada: No hay identidad válida para RLS.");
          return;
      }

      await this.sincronizarLotesPendientes(userId);
      await this.sincronizarBitacorasPendientes(userId);
      await this.procesarDiagnosticosPendientes();

    } catch (error) {
        console.error("Error en el orquestador de sincronización:", error);
    } finally {
        this.isSyncing = false;
    }
  }

  // NUEVA FUNCIÓN: Rescata los polígonos trazados sin conexión
  static async sincronizarLotesPendientes(userId) {
      try {
          const strPendientes = await AsyncStorage.getItem('@lotes_pendientes');
          if (!strPendientes) return;
          
          const pendientes = JSON.parse(strPendientes);
          if (!Array.isArray(pendientes) || pendientes.length === 0) return;

          console.log(`📤 Subiendo ${pendientes.length} lotes rezagados a Supabase...`);

          const payloadLotes = pendientes.map(lote => ({
              predio_id: lote.predio_id,
              nombre: lote.nombre,
              cultivos: lote.cultivos,
              coordenadas_poligono: lote.coordenadas_poligono,
              user_id: userId // Inyección obligatoria para RLS
          }));

          const { error } = await supabase.from('lotes').insert(payloadLotes);

          if (error) throw error;
          
          await AsyncStorage.removeItem('@lotes_pendientes');
          console.log("✅ Lotes offline sincronizados y borrados de la caché.");

      } catch (error) {
          console.error("Fallo al sincronizar lotes:", error);
      }
  }

  static async sincronizarBitacorasPendientes(userId) {
    try {
      const todasLasLlaves = await AsyncStorage.getAllKeys();
      const llavesBitacoras = todasLasLlaves.filter(key => key.startsWith('@bitacora_v4_fotos_'));

      if (llavesBitacoras.length === 0) return;

      let todosLosRegistros = [];
      for (const key of llavesBitacoras) {
        const dataRaw = await AsyncStorage.getItem(key);
        if (dataRaw) {
          const registros = JSON.parse(dataRaw);
          const registrosConLlave = registros.map(r => ({ ...r, _storageKey: key }));
          todosLosRegistros = [...todosLosRegistros, ...registrosConLlave];
        }
      }

      const pendientes = todosLosRegistros.filter(r => r.sincronizado !== true);
      if (pendientes.length === 0) return;

      console.log(`📤 Sincronizando ${pendientes.length} bitácoras...`);

      const payloadSupabase = pendientes.map(r => ({
        lote_id: r.lote_id || null, 
        fecha_evento: new Date(r.fecha).toISOString(),
        tipo: 'otro', 
        transcripcion_original: r.nota,
        datos_estructurados: { 
            nota: r.nota, 
            etapa: r.etapa,
            sincronizado_desde_app: true 
        },
        requiere_recordatorio: false,
        user_id: userId // Inyección obligatoria para RLS
      }));

      const { error } = await supabase.from('bitacora').insert(payloadSupabase);

      if (error) throw error;

      for (const key of llavesBitacoras) {
        const dataRaw = await AsyncStorage.getItem(key);
        if (dataRaw) {
          let registros = JSON.parse(dataRaw);
          let modificado = false;

          registros = registros.map(reg => {
             if (pendientes.some(p => p.id === reg.id)) {
                 modificado = true;
                 return { ...reg, sincronizado: true };
             }
             return reg;
          });

          if (modificado) {
             await AsyncStorage.setItem(key, JSON.stringify(registros));
          }
        }
      }
    } catch (e) {
      console.error("Error en sincronización de bitácoras:", e);
    }
  }

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
                  const base64Data = await FileSystem.readAsStringAsync(diag.uri, { encoding: 'base64' });

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
                      await Notifications.scheduleNotificationAsync({
                           content: {
                               title: `🌿 Diagnóstico Listo: ${diag.cultivo || 'Campo'}`,
                               body: data.respuesta, 
                               sound: 'default',
                           },
                           trigger: null, 
                      });
                  } else {
                      restantes.push(diag); 
                  }

              } catch(errItem) {
                  restantes.push(diag);
              }
          }

          await AsyncStorage.setItem('@diagnosticos_pendientes', JSON.stringify(restantes));

      } catch (e) {
          console.error("Error procesando diagnósticos:", e);
      }
  }
}