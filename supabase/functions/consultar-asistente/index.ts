import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!geminiKey || !supabaseUrl || !supabaseAnonKey) {
      throw new Error("Faltan variables de entorno esenciales en el servidor.")
    }

    // AÑADIDO: loteId opcional para buscar el historial específico
    const { pregunta, cultivoActual, contextoTemporal, imagenBase64, loteId } = await req.json()
    
    if (!pregunta && !imagenBase64) {
      return new Response(JSON.stringify({ error: "Se requiere una pregunta o una imagen." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const preguntaSegura = pregunta || "¿Qué observas en esta imagen respecto al cultivo?";
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
    
    // --- PASO RAG B1: Extraer Conocimiento Estático (Manual) ---
    let contextoExtraido = "Sin datos específicos de este tema en la base de datos.";
    
    if (cultivoActual && cultivoActual !== "General") {
      const { data: cultivoData } = await supabaseClient
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

    // --- PASO RAG B2: Extraer Historial de Bitácora (El "Cerebro Rápido") ---
    // Buscamos las últimas 5 actividades guardadas para darle memoria a corto plazo a la IA.
    let historialReciente = "No hay registros recientes en la bitácora.";
    
    if (loteId) {
       const { data: bitacoraData, error: bitacoraError } = await supabaseClient
         .from('bitacora')
         .select('fecha_evento, tipo, datos_estructurados, transcripcion_original')
         .eq('lote_id', loteId)
         .order('fecha_evento', { ascending: false })
         .limit(5);
         
       if (bitacoraData && bitacoraData.length > 0) {
           // Formateamos el historial para que Gemini lo entienda fácilmente
           historialReciente = bitacoraData.map((b, index) => {
               const datos = b.datos_estructurados || {};
               const prod = datos.producto ? `Producto: ${datos.producto}` : '';
               const obs = datos.observaciones ? `(${datos.observaciones})` : '';
               return `[Registro ${index + 1}] Acción: ${b.tipo} | ${prod} | ${obs} | Dictado original: "${b.transcripcion_original}"`;
           }).join('\n');
       }
    }

    // --- NUEVO PROMPT MAESTRO (Inyectando la memoria) ---
    const promptSistema = `
      Eres el Asesor Agrícola Experto del sistema Roslinapp. Orientas al productor rural de manera precisa, segura y apegada a la realidad. Tu trabajo ahora es doble:
      1. CLASIFICAR LA INTENCIÓN: Determina si el usuario te está haciendo una pregunta agronómica ('asesoria') o si te está dictando una actividad/recordatorio para guardar en su bitácora ('registro_bitacora').
      2. RESPONDER O REGISTRAR:
         - Si es 'asesoria', responde la duda basándote en el contexto local o fuentes oficiales (INIFAP, SADER, SENASICA).
         - Si es 'registro_bitacora', extrae los datos técnicos (producto, dosis, etapa) de lo que dictó el usuario. ADEMÁS, si el usuario pide explícitamente que se le recuerde algo en el futuro (ej. "recuérdame regar en 3 días"), extrae esa orden temporal. En el campo "respuesta" escribe una confirmación amigable y muy breve de que ya lo anotaste y programaste.
      El productor tiene seleccionado el cultivo: ${cultivoActual || 'General'}, pero puede consultar sobre CUALQUIER tema agropecuario.

      --- CONTEXTO ACTUAL DEL CAMPO ---
      Mes Actual: ${contextoTemporal?.mes_actual || 'No especificado'}
      Clima de Hoy: Max ${contextoTemporal?.clima_hoy?.temp_max || 'N/A'}°C, Min ${contextoTemporal?.clima_hoy?.temp_min || 'N/A'}°C, Humedad: ${contextoTemporal?.clima_hoy?.humedad_relativa || 'N/A'}%
      
    --- HISTORIAL RECIENTE DEL PREDIO (BITÁCORA) ---
      Revisa este historial para no recetar productos que ya se aplicaron recientemente (evitar resistencia en plagas) o para entender el contexto de la duda del agricultor:
      ${historialReciente}

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
          { text: promptSistema + "\n\nEntrada del Productor: " + preguntaSegura }
        ] 
      }],
      generationConfig: {
        temperature: 0.1, 
        maxOutputTokens: 2048,
        responseMimeType: "application/json", 
        responseSchema: {
          type: "OBJECT",
          properties: {
            accion: { 
              type: "STRING", 
              enum: ["asesoria", "registro_bitacora"],
              description: "Si el usuario pregunta algo, es asesoria. Si el usuario relata algo que hizo (ej. apliqué urea, sembré ayer), es registro_bitacora."
            },
            respuesta: { 
              type: "STRING",
              description: "El texto que el asistente leerá en voz alta al agricultor."
            },
            datos: {
              type: "OBJECT",
              description: "Llenar SOLO si la acción es registro_bitacora. Extraer de la entrada del productor.",
              properties: {
                nota: { type: "STRING", description: "Resumen limpio de la actividad realizada" },
                etapa: { type: "STRING", description: "Etapa fenológica mencionada (Siembra, Crecimiento, Floración, etc) o 'General' si no se menciona" },
                producto: { type: "STRING", description: "Agroquímico o fertilizante aplicado. Null si no aplica." },
                dosis: { type: "STRING", description: "Cantidad o dosis mencionada. Null si no aplica." },
                programar_recordatorio: { type: "BOOLEAN", description: "True si el usuario pide que se le recuerde algo." },
                dias_para_recordatorio: { type: "INTEGER", description: "Cantidad de días a futuro para la alarma. 0 si no aplica." },
                titulo_recordatorio: { type: "STRING", description: "Resumen corto de la tarea a recordar (Ej: 'Regar lote'). 'Ninguno' si no aplica." }
              }
            }
          },
          required: ["accion", "respuesta"]
        },
        thinkingConfig: { thinkingBudget: 0 }
      }
    }

    if (imagenBase64) {
      geminiPayload.contents[0].parts.push({
        inline_data: { mime_type: "image/jpeg", data: imagenBase64 }
      })
    }

    const chatRes = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    })
    
    const chatData = await chatRes.json()

    if (!chatData.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("El modelo de IA no pudo generar una respuesta válida.")
    }

    const geminiResponseText = chatData.candidates[0].content.parts[0].text;
    const resultadoEstructurado = JSON.parse(geminiResponseText);

    return new Response(JSON.stringify(resultadoEstructurado), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (err: any) {
    console.error("🚨 ERROR FATAL EN EDGE FUNCTION:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})