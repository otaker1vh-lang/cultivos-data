// ============================================================================
// CALCULADORA DE GRADOS-DÍA ACUMULADOS (GDD) - VERSIÓN REACT NATIVE
// ============================================================================

/**
 * Calcula Grados-Día (GDD) para un día usando el método simple
 */
export function calcularGDD_Simple(tmax, tmin, baseTermica, umbralSuperior = null) {
  if (umbralSuperior !== null) {
    if (tmax > umbralSuperior) tmax = umbralSuperior;
    if (tmin > umbralSuperior) tmin = umbralSuperior;
  }

  const tPromedio = (tmax + tmin) / 2;
  return Math.max(0, tPromedio - baseTermica);
}

/**
 * Calcula Grados-Día usando el método modificado (más preciso)
 */
export function calcularGDD_Modificado(tmax, tmin, baseTermica, umbralSuperior = null) {
  if (umbralSuperior !== null) {
    tmax = Math.min(tmax, umbralSuperior);
    tmin = Math.min(tmin, umbralSuperior);
  }

  // En el método modificado, si Tmax < Base, no hay acumulación.
  if (tmax < baseTermica) return 0;

  if (tmin < baseTermica) {
    tmin = baseTermica;
  }

  const tPromedio = (tmax + tmin) / 2;
  return Math.max(0, tPromedio - baseTermica);
}

/**
 * Ordena los riesgos por nivel de severidad
 */
export function ordenarRiesgosPorNivel(riesgos) {
  const prioridad = { 'CRÍTICO': 4, 'ALTO': 3, 'MEDIO': 2, 'BAJO': 1, 'NINGUNO': 0 };
  return [...riesgos].sort((a, b) => {
    return (prioridad[b.nivel] || 0) - (prioridad[a.nivel] || 0);
  });
}

/**
 * Extrae la configuración de riesgos del JSON del cultivo desde Firebase
 */
export function cargarRiesgosDesdeJSON(cultivoData) {
  const riesgos = [];
  const riesgosDetallados = cultivoData.riesgos_detallados;

  if (!riesgosDetallados) return riesgos;

  Object.keys(riesgosDetallados).forEach(nombre => {
    const info = riesgosDetallados[nombre];
    const gddInfo = info.ciclo_desarrollo?.grados_dia_desarrollo;

    if (gddInfo && gddInfo.base_termica && gddInfo.base_termica !== "N/A") {
      const parseVal = (val) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string' && val.includes('-')) {
          const parts = val.split('-').map(p => parseFloat(p.trim()));
          return (parts[0] + (parts[1] || parts[0])) / 2;
        }
        return parseFloat(val) || 0;
      };

      riesgos.push({
        nombre: nombre,
        nombre_cientifico: info.nombre_cientifico || "",
        tipo: info.tipo || "plaga",
        ciclo_desarrollo: {
          grados_dia_desarrollo: {
            base_termica: parseVal(gddInfo.base_termica),
            umbral_superior: gddInfo.umbral_superior !== "N/A" ? parseVal(gddInfo.umbral_superior) : null,
            gdd_ciclo_completo: parseVal(gddInfo.gdd_ciclo_completo),
            metodo_calculo: gddInfo.metodo_calculo || "Método simple"
          }
        },
        fases_vulnerables: info.fases_vulnerables || []
      });
    }
  });

  return riesgos;
}

/**
 * Calcula el acumulado de GDD para múltiples riesgos basándose en el historial
 */
export function calcularRiesgosMultiples(historial, riesgosConfig) {
  const resultados = {};

  riesgosConfig.forEach(riesgo => {
    let gddAcumulado = 0;
    
    // Recorremos el historial y sumamos los GDD diarios
    historial.forEach(dia => {
      // Usamos el método simple por defecto (puedes cambiarlo si riesgo.metodo lo requiere)
      const gddDia = calcularGDD_Simple(dia.tmax, dia.tmin, riesgo.umbral_base);
      gddAcumulado += gddDia;
    });

    resultados[riesgo.nombre] = {
      gdd_requeridos: riesgo.gdd_requeridos,
      prediccion: {
        gdd_alcanzado: gddAcumulado,
        // Aquí podrías agregar lógica para estimar fecha fin si tuvieras pronóstico
      }
    };
  });

  return resultados;
}

/**
 * Genera alertas basadas en el porcentaje de GDD acumulado
 */
export function generarAlertas(predicciones, diasPronostico = 0) {
  const alertas = [];
  
  Object.keys(predicciones).forEach(nombreRiesgo => {
    const data = predicciones[nombreRiesgo];
    const porcentaje = (data.prediccion.gdd_alcanzado / data.gdd_requeridos) * 100;
    
    let nivel = 'BAJO';
    let mensaje = 'Riesgo bajo por el momento.';

    // Definición de umbrales de alerta
    if (porcentaje >= 100) {
      nivel = 'CRÍTICO';
      mensaje = 'Ciclo biológico completado. Aparición inminente o activa.';
    } else if (porcentaje >= 80) {
      nivel = 'ALTO';
      mensaje = 'Desarrollo muy avanzado. Monitoreo constante recomendado.';
    } else if (porcentaje >= 50) {
      nivel = 'MEDIO';
      mensaje = 'Plaga en desarrollo activo. Prepare medidas preventivas.';
    }

    // Estimación simple de días restantes (si hay progreso > 0)
    // Se asume un avance lineal basado en el acumulado actual vs días transcurridos
    // Para una mejor estimación, se necesitaría el promedio histórico de T° de la zona
    let diasRestantes = 0;
    if (data.prediccion.gdd_alcanzado > 0 && porcentaje < 100) {
        const gddFaltante = data.gdd_requeridos - data.prediccion.gdd_alcanzado;
        // Estimamos avance diario promedio (muy simplificado, usa último valor > 0 o 10 como fallback)
        const avanceDiario = (data.prediccion.gdd_alcanzado / 30) || 10; // Suponiendo ventana de 30 días o fallback
        diasRestantes = Math.ceil(gddFaltante / avanceDiario);
    }

    // Filtramos para no llenar de alertas irrelevantes (ej. < 10% progreso)
    if (porcentaje > 5) { 
        alertas.push({
            riesgo: nombreRiesgo,
            nivel: nivel,
            mensaje: mensaje,
            dias_restantes: diasRestantes
        });
    }
  });

  return ordenarRiesgosPorNivel(alertas);
}