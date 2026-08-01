import 'dotenv/config';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

// Inicializa la conexión con la API usando tu variable de entorno
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configuración del objetivo y límites
const TARGET_FILE = 'C:\\Proyectos\\RoslinappC\\components\\AsistenteVoz.js';
const TEST_COMMAND = `npx jest ${TARGET_FILE}`;
const MAX_ATTEMPTS = 3;

// Ejecuta la prueba y devuelve el resultado
function runTest() {
  return new Promise((resolve) => {
    console.log('⏳ Ejecutando pruebas...');
    exec(TEST_COMMAND, (error, stdout, stderr) => {
      if (error) {
        // Jest envía los detalles de los fallos a stderr
        resolve({ success: false, errorMessage: stderr });
      } else {
        resolve({ success: true });
      }
    });
  });
}

// Solicita a la IA que repare el código basándose en el error
async function fixCodeWithGemini(currentCode, errorMessage) {
  console.log('🤖 Solicitando corrección a Gemini...');
  
  const prompt = `
    Eres un desarrollador experto en React Native y TypeScript/JavaScript.
    El siguiente código falló sus pruebas unitarias con este error:
    
    ERROR:
    ${errorMessage}
    
    CÓDIGO ACTUAL:
    ${currentCode}
    
    Analiza el error y corrige el código. 
    REGLA ESTRICTA: Devuelve ÚNICAMENTE el código corregido. No incluyas explicaciones, ni bloques de formato markdown (como \`\`\`javascript). El texto devuelto debe ser directamente ejecutable.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    // Limpieza de formato markdown por si la IA ignora la regla estricta
    let fixedCode = response.text.trim();
    fixedCode = fixedCode.replace(/^```(?:javascript|jsx|typescript|tsx)?\n?/i, '').replace(/```$/i, '');
    
    return fixedCode.trim();
  } catch (err) {
    console.error('❌ Error de conexión con la API de Gemini:', err);
    return null;
  }
}

// Bucle principal de ejecución
async function autoFixLoop() {
  let attempt = 1;

  while (attempt <= MAX_ATTEMPTS) {
    console.log(`\n--- Intento ${attempt} de ${MAX_ATTEMPTS} ---`);
    
    const testResult = await runTest();

    if (testResult.success) {
      console.log('✅ ¡Las pruebas pasaron exitosamente! El código es robusto.');
      return;
    }

    console.log('⚠️ Se encontraron errores en la prueba.');
    
    try {
      const currentCode = await fs.readFile(TARGET_FILE, 'utf-8');
      const newCode = await fixCodeWithGemini(currentCode, testResult.errorMessage);
      
      if (newCode) {
        // Sobrescribe el archivo local con la solución de la IA
        await fs.writeFile(TARGET_FILE, newCode, 'utf-8');
        console.log('📝 Archivo sobrescrito con la nueva versión.');
      } else {
        console.log('🛑 Abortando: No se recibió una respuesta válida de la IA.');
        break;
      }
    } catch (err) {
      console.error('❌ Error leyendo o escribiendo el archivo:', err);
      break;
    }

    attempt++;
  }

  if (attempt > MAX_ATTEMPTS) {
    console.log('🛑 Límite de intentos alcanzado. Se requiere revisión humana.');
  }
}

// Inicia el bucle
autoFixLoop();