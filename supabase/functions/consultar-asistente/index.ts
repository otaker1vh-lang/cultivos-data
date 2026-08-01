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

    // 4. PASO RAG A: Obtener el Vector Matemático (Embedding) de la pregunta
    const embeddingUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`
    const embeddingRes = await fetch(embeddingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: preguntaSegura }] }
      })
    })
    
    const embeddingData = await embeddingRes.json()
    if (!embeddingData.embedding?.values) {
      throw new Error("No se pudo generar el embedding con Gemini.")
    }
    const vector = embeddingData.embedding.values.slice(0, 768)

    // 5. PASO RAG B: Buscar conocimiento en la base de datos por Similitud Vectorial
    const { data: documentos, error: rpcError } = await supabaseClient.rpc('buscar_conocimiento_agricola', {
      query_embedding: vector,
      match_threshold: 0.35,
      match_count: 3
    })

    if (rpcError) throw rpcError

    const contextoExtraido = documentos && documentos.length > 0 
      ? documentos.map((doc: any) => doc.texto_busqueda).join(" ") 
      : "Sin datos específicos de este tema en la base de datos."

    // 6. PASO RAG C: Construir el Prompt Maestro (Consciencia Estacional y de Clima)
    const promptSistema = `
      Eres el Asesor Agrícola Experto de Roslinapp. Estás orientando a un productor rural sobre el cultivo de ${cultivoActual || 'diversos cultivos'}.
      
      --- CONTEXTO ACTUAL DEL CAMPO ---
      Mes Actual: ${contextoTemporal?.mes_actual || 'No especificado'}
      Clima de Hoy: Max ${contextoTemporal?.clima_hoy?.temp_max || 'N/A'}°C, Min ${contextoTemporal?.clima_hoy?.temp_min || 'N/A'}°C, Humedad: ${contextoTemporal?.clima_hoy?.humedad_relativa || 'N/A'}%
      Etapa Fenológica: ${contextoTemporal?.etapa_fenologica || 'No registrada'}

      --- CONOCIMIENTO TÉCNICO OFICIAL ---
      "${contextoExtraido}"
      
      Reglas de oro:
      1. CRUCE ESTACIONAL: Si la recomendación oficial choca con el clima de hoy o el mes, adviértelo.
      2. DIAGNÓSTICO: Si recibes una foto, analiza la plaga/deficiencia basándote en el conocimiento técnico.
      3. Responde de forma directa, respetuosa ("Patrón") y clara. 
      4. Máximo 3 a 4 oraciones (se leerá en voz alta). Sin viñetas.
      5. Si la respuesta no está en el conocimiento técnico, di: "Ese dato no lo tengo a la mano, patrón. Consulte a su técnico."
    `

    // 7. Configurar el Payload Multimodal para Gemini 1.5 Flash
    const chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`
    
    const geminiPayload: any = {
      contents: [{ 
        parts: [
          { text: promptSistema + "\n\nPregunta del Productor: " + preguntaSegura }
        ] 
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 250,
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
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})