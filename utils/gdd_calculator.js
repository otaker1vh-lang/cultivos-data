/**
 * CALCULADORA EPIDEMIOLÓGICA - MASTER V4
 * Maneja particularidades de Insectos, Hongos y Bacterias.
 */

export function calcularGDD_Seno(tmax, tmin, baseTermica, umbralSuperior = null) {
  if (tmax <= baseTermica) return 0;
  const tMedia = (tmax + tmin) / 2;
  const amplitud = (tmax - tmin) / 2;
  
  if (umbralSuperior !== null && tmin >= umbralSuperior) return umbralSuperior - baseTermica;
  
  // Cálculo de Seno Simple para precisión cuando Tmin < Base
  if (tmin < baseTermica) {
    const theta = Math.asin((baseTermica - tMedia) / amplitud);
    return (1 / Math.PI) * ((tMedia - baseTermica) * (Math.PI / 2 - theta) + amplitud * Math.cos(theta));
  }
  
  return Math.max(0, tMedia - baseTermica);
}

export function cargarRiesgosDesdeJSON(cultivoData) {
  const riesgos = [];
  const dataRiesgos = cultivoData.riesgos_detallados;
  if (!dataRiesgos) return riesgos;

  Object.keys(dataRiesgos).forEach(nombre => {
    const info = dataRiesgos[nombre];
    const gddInfo = info.ciclo_desarrollo?.grados_dia_desarrollo;

    if (gddInfo && gddInfo.base_termica) {
      riesgos.push({
        nombre,
        tipo: info.tipo?.toLowerCase() || "plaga",
        cientifico: info.nombre_cientifico || "",
        config: {
          base_termica: parseFloat(gddInfo.base_termica),
          umbral_superior: parseFloat(gddInfo.umbral_superior) || 35,
          gdd_requeridos: parseFloat(gddInfo.gdd_ciclo_completo) || 200,
          // Particularidad: Umbral de humedad del Master
          humedad_minima: info.condiciones_desarrollo?.humedad_relativa?.minima || 75 
        }
      });
    }
  });
  return riesgos;
}

export function calcularRiesgosMultiples(historial, riesgosConfig) {
  const resultados = {};

  riesgosConfig.forEach(riesgo => {
    let gddAcumulado = 0;
    const { config, tipo, cientifico } = riesgo;

    historial.forEach(dia => {
      let gddDia = calcularGDD_Seno(dia.tmax, dia.tmin, config.base_termica, config.umbral_superior);

      // --- PARTICULARIDADES BIOLÓGICAS ---
      const esEnfermedad = tipo.includes('enfermedad') || tipo.includes('hongo') || tipo.includes('bacteria');

      if (esEnfermedad) {
        // Regla 1: Bloqueo por sequedad (Infección inactiva)
        if (dia.humedad_relativa < config.humedad_minima) {
          gddDia = 0; 
        } 
        // Regla 2: Aceleración bacteriana (Erwinia / Xanthomonas)
        else if (tipo.includes('bacteria') && dia.tmax >= 24 && dia.tmax <= 30) {
          gddDia *= 1.5;
        }
      }

      gddAcumulado += gddDia;
    });

    resultados[riesgo.nombre] = {
      gdd_requeridos: config.gdd_requeridos,
      gdd_alcanzado: gddAcumulado,
      progreso: Math.min(100, (gddAcumulado / config.gdd_requeridos) * 100)
    };
  });

  return resultados;
}

export function generarAlertas(predicciones) {
  return Object.keys(predicciones).map(nombre => {
    const p = predicciones[nombre];
    let nivel = 'BAJO'; let color = '#2E7D32';
    if (p.progreso >= 95) { nivel = 'CRÍTICO'; color = '#B71C1C'; }
    else if (p.progreso >= 80) { nivel = 'ALTO'; color = '#E65100'; }
    else if (p.progreso >= 50) { nivel = 'MEDIO'; color = '#FBC02D'; }
    
    return { nombre, nivel, color, progreso: p.progreso.toFixed(1) };
  }).sort((a, b) => b.progreso - a.progreso);
}