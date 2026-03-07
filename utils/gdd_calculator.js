// ============================================================================
// CALCULADORA DE GRADOS-DÍA ACUMULADOS (GDD) - VERSIÓN DE PRODUCCIÓN 050326
// ============================================================================

/**
 * Calcula Grados-Día (GDD) usando el método de la curva de seno (Single Sine)
 * con corte horizontal, ideal para el desarrollo de insectos y plantas.
 */
export function calcularGDD_Seno(tmax, tmin, baseTermica, umbralSuperior = null) {
  if (tmax <= baseTermica) return 0;
  
  const tMedia = (tmax + tmin) / 2;
  const amplitud = (tmax - tmin) / 2;
  
  if (umbralSuperior !== null && tmin >= umbralSuperior) {
    return umbralSuperior - baseTermica;
  }

  if (tmin >= baseTermica && (umbralSuperior === null || tmax <= umbralSuperior)) {
    return tMedia - baseTermica;
  }

  if (tmin < baseTermica && (umbralSuperior === null || tmax <= umbralSuperior)) {
    const theta = Math.asin((baseTermica - tMedia) / amplitud);
    return (1 / Math.PI) * ((tMedia - baseTermica) * (Math.PI / 2 - theta) + amplitud * Math.cos(theta));
  }

  if (tmin >= baseTermica && umbralSuperior !== null && tmax > umbralSuperior) {
    const thetaUpper = Math.asin((umbralSuperior - tMedia) / amplitud);
    return (1 / Math.PI) * ((tMedia - baseTermica) * (thetaUpper + Math.PI / 2) + 
           (umbralSuperior - baseTermica) * (Math.PI / 2 - thetaUpper) - amplitud * Math.cos(thetaUpper));
  }

  if (tmin < baseTermica && umbralSuperior !== null && tmax > umbralSuperior) {
    const thetaBase = Math.asin((baseTermica - tMedia) / amplitud);
    const thetaUpper = Math.asin((umbralSuperior - tMedia) / amplitud);
    return (1 / Math.PI) * ((tMedia - baseTermica) * (thetaUpper - thetaBase) + 
           amplitud * (Math.cos(thetaBase) - Math.cos(thetaUpper)) + 
           (umbralSuperior - baseTermica) * (Math.PI / 2 - thetaUpper));
  }

  return Math.max(0, tMedia - baseTermica);
}

/**
 * Procesa valores de texto o rangos del JSON (ej: "1040-1100" o "10").
 * Para alertas tempranas, se prioriza el valor mínimo del rango.
 */
function parseVal(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.includes('-')) {
    const parts = val.split('-').map(p => parseFloat(p.trim()));
    return parts[0]; // Usamos el límite inferior para mayor seguridad preventiva.
  }
  return parseFloat(val) || 0;
}

/**
 * Carga los riesgos mapeando correctamente las claves del JSON.
 */
export function cargarRiesgosDesdeJSON(cultivoData) {
  const riesgos = [];
  // Soporta ambas nomenclaturas encontradas en el JSON: riesgos_detallados o riesgos_fitosanitarios.
  const dataRiesgos = cultivoData.riesgos_detallados || cultivoData.riesgos_fitosanitarios;

  if (!dataRiesgos) return riesgos;

  Object.keys(dataRiesgos).forEach(nombre => {
    const info = dataRiesgos[nombre];
    const gddInfo = info.ciclo_desarrollo?.grados_dia_desarrollo;

    if (gddInfo && gddInfo.base_termica && gddInfo.base_termica !== "N/A") {
      // Extracción de humedad desde condiciones_desarrollo (donde está en su JSON).
      const humedadUmbral = info.condiciones_desarrollo?.humedad_relativa?.minima || 80;

      riesgos.push({
        nombre: nombre,
        cientifico: info.nombre_cientifico || "",
        tipo: (info.tipo || info.modelo_fenologico || "plaga").toLowerCase(),
        config: {
          base_termica: parseVal(gddInfo.base_termica),
          umbral_superior: gddInfo.umbral_superior !== "N/A" ? parseVal(gddInfo.umbral_superior) : null,
          gdd_requeridos: parseVal(gddInfo.gdd_ciclo_completo),
          metodo_calculo: gddInfo.metodo_calculo || "seno",
          humedad_relativa_min: humedadUmbral
        }
      });
    }
  });

  return riesgos;
}

/**
 * Ejecuta el cálculo epidemiológico diferenciado.
 */
export function calcularRiesgosMultiples(historial, riesgosConfig) {
  const resultados = {};

  riesgosConfig.forEach(riesgo => {
    let gddAcumulado = 0;
    const { config, tipo, nombre, cientifico } = riesgo;
    
    historial.forEach(dia => {
      let gddDia = calcularGDD_Seno(dia.tmax, dia.tmin, config.base_termica, config.umbral_superior);

      // Lógica específica para Enfermedades (Hongos/Bacterias)
      const esEnfermedad = tipo.includes('enfermedad') || tipo.includes('hongo') || cientifico.includes('Erwinia');

      if (esEnfermedad) {
        if (dia.humedad_relativa >= config.humedad_relativa_min) {
            // Multiplicador para bacterias si la temperatura es óptima (24-30°C).
            if (cientifico.includes('Erwinia') && dia.tmax >= 24 && dia.tmax <= 30) {
                gddDia *= 1.5;
            }
        } else {
            gddDia = 0; // Sin humedad no hay infección activa.
        }
      }
      
      gddAcumulado += gddDia;
    });

    resultados[nombre] = {
      gdd_requeridos: config.gdd_requeridos,
      gdd_alcanzado: gddAcumulado,
      progreso: (gddAcumulado / config.gdd_requeridos) * 100
    };
  });

  return resultados;
}

/**
 * Genera el reporte de alertas finales basado en severidad.
 */
export function generarAlertas(predicciones) {
  const alertas = [];
  
  Object.keys(predicciones).forEach(nombre => {
    const data = predicciones[nombre];
    const porcentaje = data.progreso;
    
    let nivel = 'BAJO';
    let mensaje = 'Monitoreo de rutina.';

    if (porcentaje >= 100) {
      nivel = 'CRÍTICO';
      mensaje = 'Ciclo biológico completado. Presencia inminente o activa.';
    } else if (porcentaje >= 80) {
      nivel = 'ALTO';
      mensaje = 'Riesgo inminente. Prepare intervenciones preventivas.';
    } else if (porcentaje >= 50) {
      nivel = 'MEDIO';
      mensaje = 'Desarrollo en curso. Incremente la frecuencia de inspección.';
    }

    if (porcentaje > 5) { 
        alertas.push({
            riesgo: nombre,
            nivel: nivel,
            mensaje: mensaje,
            progreso: porcentaje.toFixed(1),
            gdd_actual: data.gdd_alcanzado.toFixed(1)
        });
    }
  });

  return alertas.sort((a, b) => {
    const p = { 'CRÍTICO': 4, 'ALTO': 3, 'MEDIO': 2, 'BAJO': 1 };
    return p[b.nivel] - p[a.nivel];
  });
}