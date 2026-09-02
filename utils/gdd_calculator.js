/**
 * CALCULADORA EPIDEMIOLÓGICA - MASTER V4 (BLINDADA)
 * Maneja particularidades de Insectos, Hongos y Bacterias de forma segura.
 */

export function calcularGDD_Seno(tmaxRaw, tminRaw, baseTermicaRaw, umbralSuperiorRaw = null) {
  // 1. Sanitización estricta de entradas numéricas
  const tmax = parseFloat(tmaxRaw);
  const tmin = parseFloat(tminRaw);
  const baseTermica = parseFloat(baseTermicaRaw);
  const umbralSuperior = umbralSuperiorRaw !== null ? parseFloat(umbralSuperiorRaw) : null;

  // Si faltan datos climáticos o de configuración, no sumamos GDD ese día
  if (isNaN(tmax) || isNaN(tmin) || isNaN(baseTermica)) return 0;

  if (tmax <= baseTermica) return 0;
  
  const tMedia = (tmax + tmin) / 2;
  const amplitud = (tmax - tmin) / 2;
  
  if (umbralSuperior !== null && !isNaN(umbralSuperior) && tmin >= umbralSuperior) {
    return Math.max(0, umbralSuperior - baseTermica);
  }
  
  // Cálculo de Seno Simple para precisión cuando Tmin < Base
  if (tmin < baseTermica) {
    // BLINDAJE: Prevenir división por cero si tmax == tmin (Fallo de API climática)
    if (amplitud === 0) return 0; 
    
    // BLINDAJE: Restringir valor entre -1 y 1 para que Math.asin no devuelva NaN
    const valorAsin = Math.max(-1, Math.min(1, (baseTermica - tMedia) / amplitud));
    const theta = Math.asin(valorAsin);
    
    return (1 / Math.PI) * ((tMedia - baseTermica) * (Math.PI / 2 - theta) + amplitud * Math.cos(theta));
  }
  
  return Math.max(0, tMedia - baseTermica);
}

export function cargarRiesgosDesdeJSON(cultivoData) {
  const riesgos = [];
  const nombresProcesados = new Set();

  if (!cultivoData) return riesgos;

  let todosLosRiesgos = [];
  
  // Extraemos de TODAS las posibles ramas del JSON para no perder datos
  const fuentes = [
    cultivoData.riesgos_detallados, 
    cultivoData.plagas_enfermedades, 
    cultivoData.sanidad?.principales_plagas_enfermedades
  ];
  
  fuentes.forEach(fuente => {
      if (fuente && typeof fuente === 'object') {
          // Normaliza tanto Objetos como Arrays
          const arr = Array.isArray(fuente) 
            ? fuente 
            : Object.keys(fuente).map(key => ({ nombre: key, ...fuente[key] }));
          todosLosRiesgos = [...todosLosRiesgos, ...arr];
      }
  });

  todosLosRiesgos.forEach(info => {
    if (!info) return;
    
    const nombreOriginal = info.nombre || 'Riesgo Desconocido';
    // Normalización: convierte a minúsculas y quita acentos para comparar
    const nombreNormalizado = nombreOriginal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // Filtro anti-duplicados
    if (nombresProcesados.has(nombreNormalizado)) return; 
    nombresProcesados.add(nombreNormalizado);

    const configGDD = info.ciclo_desarrollo?.grados_dia_desarrollo || info.grados_dia_desarrollo;
    const condiciones = info.condiciones_desarrollo || info.condiciones;
    const humedadMin = condiciones?.humedad_relativa?.minima || condiciones?.humedad_min || 0;

    if (configGDD && configGDD.base_termica !== undefined) {
      const reqGDD = configGDD.gdd_ciclo_completo || configGDD.gdd_primera_generacion || configGDD.gdd_requeridos;

      if (reqGDD) {
        riesgos.push({
          nombre: nombreOriginal,
          tipo: String(info.tipo || info.categoria || 'Plaga').toLowerCase(),
          config: {
            base_termica: parseFloat(configGDD.base_termica) || 10,
            umbral_superior: configGDD.umbral_superior ? parseFloat(configGDD.umbral_superior) : null,
            gdd_requeridos_numero: parseFloat(reqGDD) || 100, 
            gdd_requeridos_texto: String(reqGDD), 
            humedad_minima: parseFloat(humedadMin)
          }
        });
      }
    }
  });

  return riesgos;
}

// CORRECCIÓN CRÍTICA: Se invirtieron los argumentos para coincidir con la llamada en HomeScreen.js
export function calcularRiesgosMultiples(riesgosConfig, historial) {
  const resultados = {};
  
  // Verificación de seguridad por si falla AsyncStorage
  if (!Array.isArray(riesgosConfig) || !Array.isArray(historial)) return resultados;

  riesgosConfig.forEach(riesgo => {
    let gddAcumulado = 0;
    const { config, tipo, nombre } = riesgo;

    historial.forEach(dia => {
      // Omitir días con datos corruptos
      if (!dia || dia.tmax === undefined || dia.tmin === undefined) return;

      let gddDia = calcularGDD_Seno(dia.tmax, dia.tmin, config.base_termica, config.umbral_superior);

      // --- PARTICULARIDADES BIOLÓGICAS ---
      const esEnfermedad = tipo.includes('enfermedad') || tipo.includes('hongo') || tipo.includes('bacteria');

      if (esEnfermedad) {
        // Regla 1: Bloqueo por sequedad (Solo si la API del clima envió humedad)
        const hr = parseFloat(dia.humedad_relativa);
        if (!isNaN(hr) && config.humedad_minima > 0 && hr < config.humedad_minima) {
          gddDia = 0; 
        } 
        // Regla 2: Aceleración bacteriana (Erwinia / Xanthomonas)
        else if (tipo.includes('bacteria') && dia.tmax >= 24 && dia.tmax <= 30) {
          gddDia *= 1.5;
        }
      }

      gddAcumulado += gddDia;
    });

    let gddReqRaw = config.gdd_requeridos_texto || "0";
    let gddReq = config.gdd_requeridos_numero || 1;
    let progresoRaw = 0;
    
    if (gddReq > 0) {
        progresoRaw = (gddAcumulado / gddReq) * 100;
    }

    resultados[nombre] = {
      // Exportamos el texto original (ej. "350-500" o "N_A") para mostrar en UI
      gdd_meta_texto: gddReqRaw, 
      // Exportamos el límite inferior para cálculos matemáticos
      gdd_meta_numero: gddReq,
      gdd_alcanzado: gddAcumulado,
      progreso: Math.min(100, Math.max(0, progresoRaw))
    };
  });

  return resultados;
}

export function generarAlertas(predicciones) {
  if (!predicciones || typeof predicciones !== 'object') return [];

  return Object.keys(predicciones).map(nombre => {
    const p = predicciones[nombre];
    let nivel = 'BAJO'; 
    let color = '#2E7D32';
    
    // Sanitizar el progreso antes de aplicar toFixed
    const progreso = isNaN(p.progreso) ? 0 : p.progreso;

    if (progreso >= 95) { nivel = 'CRÍTICO'; color = '#B71C1C'; }
    else if (progreso >= 80) { nivel = 'ALTO'; color = '#E65100'; }
    else if (progreso >= 50) { nivel = 'MEDIO'; color = '#FBC02D'; }
    
    return { 
      nombre, 
      nivel, 
      color, 
      progreso: progreso.toFixed(1) 
    };
  }).sort((a, b) => parseFloat(b.progreso) - parseFloat(a.progreso));
}