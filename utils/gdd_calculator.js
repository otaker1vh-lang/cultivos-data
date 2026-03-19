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
  if (!cultivoData) return riesgos;

  // BLINDAJE: Búsqueda profunda en múltiples llaves posibles (Igual que en PlagasScreen)
  const dataRiesgos = cultivoData.riesgos_detallados || cultivoData.plagas_enfermedades || cultivoData.sanidad?.principales_plagas_enfermedades;
  if (!dataRiesgos || typeof dataRiesgos !== 'object') return riesgos;

  // Ajuste para manejar tanto Objetos (Firebase) como Arrays (Manager)
  const riesgosArray = Array.isArray(dataRiesgos) 
    ? dataRiesgos 
    : Object.keys(dataRiesgos).map(key => ({ nombre: key, ...dataRiesgos[key] }));

  riesgosArray.forEach(info => {
    if (!info) return;
    
    // Busca la configuración en diferentes profundidades
    const configGDD = info.ciclo_desarrollo?.grados_dia_desarrollo || info.grados_dia_desarrollo || info.gdd;
    
    // Solo agregamos si hay una configuración válida con base térmica y requerimientos
    if (configGDD && configGDD.base_termica !== undefined && configGDD.gdd_requeridos) {
      riesgos.push({
        nombre: info.nombre || 'Riesgo Desconocido',
        tipo: String(info.tipo || 'Plaga').toLowerCase(),
        config: {
          base_termica: parseFloat(configGDD.base_termica) || 10,
          umbral_superior: configGDD.umbral_superior ? parseFloat(configGDD.umbral_superior) : null,
          gdd_requeridos: parseFloat(configGDD.gdd_ciclo_completo) || parseFloat(configGDD.gdd_primera_generacion) || parseFloat(configGDD.gdd_requeridos) || 100,
          humedad_minima: parseFloat(configGDD.humedad_minima) || 0
        }
      });
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

    // BLINDAJE: Prevenir división por cero si Firebase envía gdd_requeridos como 0
    const gddReq = config.gdd_requeridos > 0 ? config.gdd_requeridos : 1;
    let progresoRaw = (gddAcumulado / gddReq) * 100;
    if (isNaN(progresoRaw)) progresoRaw = 0;

    resultados[nombre] = {
      gdd_requeridos: config.gdd_requeridos,
      gdd_alcanzado: gddAcumulado,
      progreso: Math.min(100, Math.max(0, progresoRaw)) // Restringir siempre entre 0 y 100%
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