import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Catálogo de palabras clave de alto riesgo fitosanitario
const PLAGAS_CRITICAS = [
  "cogollero", "araña roja", "pulgón", "trips", "mosca blanca", 
  "picudo", "roya", "fusarium", "gallina ciega"
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Faltan credenciales.")
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Buscar registros en la bitácora de las últimas 24 horas
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: reportes, error } = await supabaseAdmin
      .from('bitacora')
      .select(`
        id, 
        transcripcion_original, 
        datos_estructurados,
        lotes (
          predios ( user_id, latitud, longitud )
        )
      `)
      .gte('created_at', ayer);

    if (error) throw error;
    if (!reportes || reportes.length === 0) {
        return new Response("Sin reportes recientes.", { status: 200, headers: corsHeaders });
    }

    let alertasEnviadas = 0;
    const tokensYaNotificados = new Set<string>(); // Para no saturar al mismo vecino

    // 2. Analizar cada reporte buscando coincidencias críticas
    for (const reporte of reportes) {
      const textoBase = ((reporte.transcripcion_original || "") + " " + (reporte.datos_estructurados?.nota || "")).toLowerCase();
      
      const plagaEncontrada = PLAGAS_CRITICAS.find(plaga => textoBase.includes(plaga));

      if (plagaEncontrada && reporte.lotes?.predios) {
        const predioOrigen = reporte.lotes.predios;
        
        if (!predioOrigen.latitud || !predioOrigen.longitud) continue;

        // 3. Ejecutar la Búsqueda Espacial PostGIS (Radio de 10 Kilómetros = 10000 metros)
        const { data: vecinos } = await supabaseAdmin.rpc('buscar_tokens_vecinos', {
          origen_lon: predioOrigen.longitud,
          origen_lat: predioOrigen.latitud,
          radio_metros: 10000, 
          excluir_user_id: predioOrigen.user_id
        });

        if (vecinos && vecinos.length > 0) {
          const mensajesPush = [];

          for (const vecino of vecinos) {
            if (!tokensYaNotificados.has(vecino.push_token)) {
              mensajesPush.push({
                to: vecino.push_token,
                sound: 'default',
                title: "⚠️ Alerta Fitosanitaria Comunitaria",
                body: `Se ha detectado actividad de ${plagaEncontrada.toUpperCase()} a menos de 10km de su predio. Refuerce el monitoreo de sus cultivos.`,
                data: { pantalla: 'HomeScreen' },
              });
              tokensYaNotificados.add(vecino.push_token);
              alertasEnviadas++;
            }
          }

          // 4. Enviar a Expo Push Notificacions en bloque (Chunking)
          if (mensajesPush.length > 0) {
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mensajesPush),
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ 
        mensaje: "Auditoría espacial completada.", 
        alertas_vecinales_enviadas: alertasEnviadas 
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})