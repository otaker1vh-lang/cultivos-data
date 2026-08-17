import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// --- CONFIGURACIÓN Y CONSTANTES ---
const TEMP_BASE_DEFAULT: Record<string, number> = {
  "maiz": 10,
  "frijol": 10,
  "trigo": 4.5,
  "tomate": 10,
  "default": 10
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- FUNCIONES MATEMÁTICAS (Traídas de tu gdd_calculator.js) ---
function calcularGDD_Seno(tmax: number, tmin: number, baseTermica: number, umbralSuperior: number | null = null) {
  if (isNaN(tmax) || isNaN(tmin) || isNaN(baseTermica)) return 0;
  if (tmax <= baseTermica) return 0;
  
  const tMedia = (tmax + tmin) / 2;
  const amplitud = (tmax - tmin) / 2;
  
  if (umbralSuperior !== null && !isNaN(umbralSuperior) && tmin >= umbralSuperior) {
    return Math.max(0, umbralSuperior - baseTermica);
  }
  
  if (tmin < baseTermica) {
    if (amplitud === 0) return 0; 
    const valorAsin = Math.max(-1, Math.min(1, (baseTermica - tMedia) / amplitud));
    const theta = Math.asin(valorAsin);
    return (1 / Math.PI) * ((tMedia - baseTermica) * (Math.PI / 2 - theta) + amplitud * Math.cos(theta));
  }
  
  return Math.max(0, tMedia - baseTermica);
}

// Función para enviar notificaciones Push mediante Expo
async function enviarPushNotification(expoPushToken: string, titulo: string, mensaje: string) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: titulo,
    body: mensaje,
    data: { pantalla: 'HomeScreen' },
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (error) {
    console.error(`Error enviando Push a ${expoPushToken}:`, error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Faltan credenciales.");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const fechaObjetivo = ayer.toISOString().split('T')[0];

    // Consulta expandida: Traemos el user_id para poder enviarle la alerta y los push_tokens
    const { data: lotes, error: errorLotes } = await supabaseAdmin
      .from('lotes')
      .select(`
        id,
        nombre,
        cultivo,
        predios!inner ( id, latitud, longitud, user_id, perfiles:user_id(expo_push_token) )
      `)
      .not('predios.latitud', 'is', null)
      .not('predios.longitud', 'is', null);

    if (errorLotes) throw errorLotes;
    if (!lotes || lotes.length === 0) return new Response("Sin lotes.", { status: 200, headers: corsHeaders });

    let notificacionesEnviadas = 0;

    for (const lote of lotes) {
      const predio = lote.predios;
      
      const { data: climaExistente } = await supabaseAdmin
        .from('clima_gdd')
        .select('id')
        .eq('lote_id', lote.id)
        .eq('fecha', fechaObjetivo)
        .maybeSingle();

      if (climaExistente) continue;

      try {
        const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${predio.latitud}&longitude=${predio.longitud}&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum&timezone=auto&start_date=${fechaObjetivo}&end_date=${fechaObjetivo}`;
        const resp = await fetch(openMeteoUrl);
        const datos = await resp.json();

        if (!datos.daily || datos.daily.time.length === 0) continue;

        const tmax = datos.daily.temperature_2m_max[0];
        const tmin = datos.daily.temperature_2m_min[0];
        const hr = datos.daily.relative_humidity_2m_mean?.[0] || 50;
        const pp = datos.daily.precipitation_sum?.[0] || 0;

        // --- CALCULAR GDD DEL DÍA USANDO SENO SIMPLE ---
        const cultivoStr = lote.cultivo.toLowerCase();
        let tBase = TEMP_BASE_DEFAULT.default;
        for (const clave of Object.keys(TEMP_BASE_DEFAULT)) {
            if (cultivoStr.includes(clave)) { tBase = TEMP_BASE_DEFAULT[clave]; break; }
        }

        let gddDia = calcularGDD_Seno(tmax, tmin, tBase);

        const { error: insertError } = await supabaseAdmin.from('clima_gdd').insert({
            lote_id: lote.id, fecha: fechaObjetivo, temp_max: tmax, temp_min: tmin, humedad_relativa: hr, precipitacion_mm: pp, gdd_dia: parseFloat(gddDia.toFixed(2)), fuente: 'api_externa'
        });

        if (insertError) continue;

        // --- SISTEMA DE ALERTAS (NUEVO) ---
        // 1. Obtener la configuración del cultivo para ver las plagas
        const { data: cultivoData } = await supabaseAdmin
            .from('cultivos')
            .select('riesgos_detallados, sanidad')
            .ilike('nombre', `%${lote.cultivo}%`)
            .maybeSingle();

        if (cultivoData) {
            const dataRiesgos = cultivoData.riesgos_detallados || cultivoData.sanidad?.principales_plagas_enfermedades;
            if (dataRiesgos) {
                
                // 2. Obtener la suma total de GDD de este lote en los últimos 180 días
                const { data: historialGDD } = await supabaseAdmin
                    .from('clima_gdd')
                    .select('gdd_dia')
                    .eq('lote_id', lote.id)
                    .gte('fecha', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

                if (historialGDD) {
                    const gddAcumulado = historialGDD.reduce((acc, obj) => acc + (obj.gdd_dia || 0), 0);
                    
                    const riesgosArray = Array.isArray(dataRiesgos) ? dataRiesgos : Object.keys(dataRiesgos).map(key => ({ nombre: key, ...dataRiesgos[key] }));
                    
                    const token = predio.perfiles?.expo_push_token;

                    // 3. Revisar si alguna plaga llegó a nivel CRÍTICO (95%) o ALTO (80%)
                    for (const info of riesgosArray) {
                        const configGDD = info.ciclo_desarrollo?.grados_dia_desarrollo || info.grados_dia_desarrollo;
                        if (configGDD && configGDD.gdd_requeridos) {
                            const req = parseFloat(configGDD.gdd_requeridos);
                            const progreso = (gddAcumulado / req) * 100;
                            
                            if (progreso >= 95 && token) {
                                await enviarPushNotification(token, `🚨 Riesgo Fitosanitario Crítico`, `El ciclo biológico de ${info.nombre || 'la plaga'} en el lote ${lote.nombre} llegó al 95%. Urge monitoreo en campo.`);
                                notificacionesEnviadas++;
                            } else if (progreso >= 80 && progreso < 85 && token) {
                                await enviarPushNotification(token, `⚠️ Alerta Preventiva GDD`, `Condiciones favorables (80%) para el desarrollo de ${info.nombre || 'la plaga'} en el lote ${lote.nombre}.`);
                                notificacionesEnviadas++;
                            }
                        }
                    }
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (e) {
        console.error(`Error lote ${lote.id}:`, e);
      }
    }

    return new Response(JSON.stringify({ mensaje: "Ok", notificaciones: notificacionesEnviadas }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})