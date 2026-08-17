import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const iotSecretKey = Deno.env.get('IOT_SECRET_KEY') // Token secreto compartido para seguridad del ESP32

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Faltan credenciales del servidor.")
    }

    // Validación de seguridad básica mediante Token Secreto en el Header
    const authHeader = req.headers.get('Authorization')
    if (iotSecretKey && authHeader !== `Bearer ${iotSecretKey}`) {
      return new Response(JSON.stringify({ error: "No autorizado: Token IoT inválido." }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { lote_id, temp_max, temp_min, humedad_relativa, precipitacion_mm } = body

    if (!lote_id || temp_max === undefined || temp_min === undefined) {
      return new Response(JSON.stringify({ error: "Faltan campos obligatorios (lote_id, temp_max, temp_min)." }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const hoy = new Date().toISOString().split('T')[0]

    // Cálculo simplificado de GDD diario basado en la temperatura reportada por el ESP32
    const tBase = 10; // Temperatura base estándar por defecto
    const tempMedia = (parseFloat(temp_max) + parseFloat(temp_min)) / 2;
    let gddDia = tempMedia - tBase;
    if (gddDia < 0) gddDia = 0;

    // Registrar o actualizar el clima del día enviado por el sensor físico (evitando duplicados con upsert)
    const { error: insertError } = await supabaseAdmin
      .from('clima_gdd')
      .upsert({
        lote_id: lote_id,
        fecha: hoy,
        temp_max: parseFloat(temp_max),
        temp_min: parseFloat(temp_min),
        humedad_relativa: humedad_relativa ? parseFloat(humedad_relativa) : 50,
        precipitacion_mm: precipitacion_mm ? parseFloat(precipitacion_mm) : 0,
        gdd_dia: parseFloat(gddDia.toFixed(2)),
        fuente: 'agrocontrol_iot'
      }, { onConflict: 'lote_id,fecha' });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ mensaje: "Telemetría de AgroControl registrada exitosamente." }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error("Error en telemetría IoT:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})