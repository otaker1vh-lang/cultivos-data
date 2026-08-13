import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Configuración de cabeceras CORS para permitir peticiones desde la App Móvil
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

serve(async (req) => {
  // Manejar la petición preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Obtener las variables de entorno del servidor de Supabase
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!geminiKey || !supabaseUrl || !supabaseAnonKey) {
      throw new Error("Faltan variables de entorno esenciales en el servidor.")
    }

    // 2. Extraer los parámetros extendidos que envía la app móvil
    const { pregunta, cultivoActual, contextoTemporal, imagenBase64 } = await req.json()
    
    if (!pregunta && !imagenBase64) {
      return new Response(JSON.stringify({ error: "Se requiere una pregunta o una imagen." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const preguntaSegura = pregunta || "¿Qué observas en esta imagen respecto al cultivo?";

    // 3. Inicializar el cliente interno de Supabase
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)

    // 4 y 5. Buscar la información del cultivo directamente en la tabla 'cultivos'
    let contextoExtraido = "Sin datos específicos de este tema en la base de datos.";
    
    if (cultivoActual && cultivoActual !== "General") {
      const { data: cultivoData, error: dbError } = await supabaseClient
        .from('cultivos')
        .select('requerimientos_agroclimaticos, plagas_resumen, calendarios_regionales, guia_errores_comunes, labores')
        .ilike('nombre', `%${cultivoActual}%`)
        .limit(1)
        .maybeSingle();

      if (cultivoData) {
        contextoExtraido = `
          Datos técnicos para ${cultivoActual}:
          - Clima y Suelo: ${cultivoData.requerimientos_agroclimaticos || 'N/A'}
          - Calendario de Siembra: ${cultivoData.calendarios_regionales || 'N/A'}
          - Plagas y Enfermedades: ${cultivoData.plagas_resumen || 'N/A'}
          - Labores: ${cultivoData.labores || 'N/A'}
          - Errores Comunes: ${cultivoData.guia_errores_comunes || 'N/A'}
        `;
      }
    }

    // 6. PASO RAG C: Construir el Prompt Maestro (Consciencia Estacional y de Clima)
    const promptSistema = `
      Eres el Asesor Agrícola Experto del sistema Roslinapp. Orientas al productor rural de manera precisa, segura y apegada a la realidad.
      El productor tiene seleccionado el cultivo: ${cultivoActual || 'General'}, pero puede consultar sobre CUALQUIER tema agropecuario.

      --- CONTEXTO ACTUAL DEL CAMPO ---
      Mes Actual: ${contextoTemporal?.mes_actual || 'No especificado'}
      Clima de Hoy: Max ${contextoTemporal?.clima_hoy?.temp_max || 'N/A'}°C, Min ${contextoTemporal?.clima_hoy?.temp_min || 'N/A'}°C, Humedad: ${contextoTemporal?.clima_hoy?.humedad_relativa || 'N/A'}%
      
      --- CONOCIMIENTO LOCAL EXTRAÍDO DE LA APP ---
      "${contextoExtraido}"

      --- REGLAS DE RESPUESTA Y RECETAS (CERO ALUCINACIONES) ---
      1. PRIORIDAD LOCAL: Revisa primero el "CONOCIMIENTO LOCAL". Si la respuesta está ahí, úsala como base principal.
      2. CONOCIMIENTO OFICIAL: Si el conocimiento local no contiene la respuesta, responde utilizando tu conocimiento experto preentrenado, pero basándote ÚNICAMENTE en manuales y guías de instituciones públicas de México (INIFAP, SADER, SENASICA, COFEPRIS, Chapingo).
      3. AGROQUÍMICOS Y DOSIS: Tienes permitido sugerir ingredientes activos, productos comerciales genéricos y dosis para nutrición, plagas y enfermedades, siempre que tengan sustento oficial. No inventes dosis.
      4. AVISO OBLIGATORIO: Siempre que sugieras un agroquímico, fertilizante o dosis, tu última oración DEBE SER exactamente: "Recuerde que estos datos son ilustrativos, patrón, corrobore la información con su técnico antes de aplicar."
      5. OMISIÓN DE TRANSICIÓN: Si el productor pregunta por un cultivo distinto al seleccionado, RESPONDE DIRECTAMENTE. No gastes palabras diciendo frases como "Aunque tenga seleccionado el maíz, le comento sobre el frijol...". Ve directo al grano.
      6. VÁLVULA DE ESCAPE: Solo si la pregunta es sobre un tema sin certeza oficial, di textualmente: "Ese dato no lo tengo a la mano con respaldo oficial, patrón. Le sugiero consultarlo con su técnico."

      --- INSTRUCCIONES DE TONO Y FORMATO ---
      - Trato: Dirígete al productor con respeto usando la palabra "Patrón". Sé claro, directo y práctico.
      - Formato: Máximo 4 a 5 oraciones cortas.
      - Restricciones de Voz: Escribe en formato conversacional fluido. ESTÁ ESTRICTAMENTE PROHIBIDO usar viñetas, guiones, asteriscos o símbolos (tu respuesta será leída por un sintetizador de voz).
      - DIAGNÓSTICO CON FOTO: Si recibes una foto, diagnostica la plaga/deficiencia y sugiere de inmediato un manejo agronómico aprobado en México.
    `
    // 7. Configurar el Payload Multimodal para el modelo actualizado
    const chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
    
    const geminiPayload: any = {
      contents: [{ 
        parts: [
          { text: promptSistema + "\n\nPregunta del Productor: " + preguntaSegura }
        ] 
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        thinkingConfig: {
          thinkingBudget: 0          // desactiva el "thinking" interno
        }
      }
    }

    // Inyectar la imagen si el productor subió una
    if (imagenBase64) {
      geminiPayload.contents[0].parts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: imagenBase64
        }
      })
    }

    const chatRes = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    })
    
    const chatData = await chatRes.json()

    const finishReason = chatData.candidates?.[0]?.finishReason
    if (finishReason === "MAX_TOKENS") {
      console.warn("⚠️ Respuesta cortada por límite de tokens:", JSON.stringify(chatData))
    }

    if (!chatData.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error("Error de Gemini o respuesta bloqueada:", JSON.stringify(chatData))
      throw new Error("El modelo de IA no pudo generar una respuesta válida para esta consulta.")
    }

    const respuestaFinal = chatData.candidates[0].content.parts[0].text

    // 8. Retornar el resultado a la app
    return new Response(JSON.stringify({ respuesta: respuestaFinal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (err: any) {
    // Te sugiero agregar esta línea para que los errores se guarden en los Logs de Supabase
    console.error("🚨 ERROR FATAL EN EDGE FUNCTION:", err);
    
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})