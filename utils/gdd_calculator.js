// ============================================================================
// CALCULADORA DE GRADOS-DÍA ACUMULADOS (GDD) - VERSIÓN REACT NATIVE (CORREGIDA)
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
 * Acumula GDD a lo largo de varios días
 * MEJORA: Validación de datos para evitar NaN
 */
export function acumularGDD(datos_climaticos, baseTermica, umbralSuperior = null, metodo = 'modificado') {
  let gdd_acumulado = 0;
  const calculador = metodo === 'simple' ? calcularGDD_Simple : calcularGDD_Modificado;

  return datos_climaticos.map(dia => {
    // Validación de seguridad: Si falta tmax o tmin, asumimos 0 o saltamos cálculo
    const tmax = parseFloat(dia.tmax);
    const tmin = parseFloat(dia.tmin);

    // Si los datos no son números válidos, devolvemos el estado anterior sin cambios
    if (isNaN(tmax) || isNaN(tmin)) {
      return {
        fecha: dia.fecha,
        tmax: 0,
        tmin: 0,
        gdd_diario: 0,
        gdd_acumulado: Number(gdd_acumulado.toFixed(2)),
        error: 'Datos incompletos'
      };
    }

    const gdd_diario = calculador(tmax, tmin, baseTermica, umbralSuperior);
    gdd_acumulado += gdd_diario;

    return {
      fecha: dia.fecha,
      tmax,
      tmin,
      gdd_diario: Number(gdd_diario.toFixed(2)),       
      gdd_acumulado: Number(gdd_acumulado.toFixed(2))  
    };
  });
}

/**
 * Predice cuándo ocurrirá un evento basado en GDD
 */
export function predecirEvento(historial_gdd, gdd_objetivo) {
  if (!historial_gdd || historial_gdd.length === 0) return null;

  for (let i = 0; i < historial_gdd.length; i++) {
    const dia = historial_gdd[i];
    if (dia.gdd_acumulado >= gdd_objetivo) {
      return {
        fecha_evento: dia.fecha,
        gdd_alcanzado: dia.gdd_acumulado,
        dias_desde_inicio: i + 1,
        mensaje: `Evento predicho para ${dia.fecha}`,
        estado: 'ALCANZADO'
      };
    }
  }

  const ultimo = historial_gdd[historial_gdd.length - 1];
  const gdd_faltantes = gdd_objetivo - ultimo.gdd_acumulado;

  // Calculamos el promedio diario acumulado histórico
  const gdd_promedio = ultimo.gdd_acumulado / historial_gdd.length;

  // Si el promedio es 0 o muy bajo (invierno), evitamos dividir por cero o predicciones infinitas
  const dias_faltantes = (gdd_promedio > 0.1) 
    ? Math.ceil(gdd_faltantes / gdd_promedio) 
    : null; // Null indica que no se puede predecir aún (dormancia)

  const mensaje = dias_faltantes 
    ? `Faltan ${gdd_faltantes.toFixed(0)} GDD (~${dias_faltantes} días)`
    : `Faltan ${gdd_faltantes.toFixed(0)} GDD (Progreso detenido)`;

  return {
    fecha_evento: null,
    gdd_alcanzado: ultimo.gdd_acumulado,
    gdd_faltantes,
    dias_estimados_faltantes: dias_faltantes || 999, // Mantener 999 para ordenamiento si es necesario
    mensaje,
    estado: 'PENDIENTE'
  };
}

/**
 * Calcula múltiples eventos de plagas/enfermedades
 */
export function calcularRiesgosMultiples(datos_climaticos, riesgos) {
  const predicciones = {};

  riesgos.forEach(riesgo => {
    const gdd = riesgo.ciclo_desarrollo?.grados_dia_desarrollo;
    if (!gdd) return;

    const baseTermica = parseFloat(gdd.base_termica);
    // Validación extra: Base térmica es obligatoria
    if (isNaN(baseTermica)) return; 

    const umbral = gdd.umbral_superior ? parseFloat(gdd.umbral_superior) : null;

    let gdd_objetivo = 0;
    if (typeof gdd.gdd_ciclo_completo === 'string') {
        // Maneja rangos "100-150" tomando el promedio o el inicio
        const partes = gdd.gdd_ciclo_completo.split('-');
        gdd_objetivo = parseFloat(partes[0]);
    } else {
        gdd_objetivo = parseFloat(gdd.gdd_ciclo_completo);
    }

    const historial = acumularGDD(
      datos_climaticos,
      baseTermica,
      umbral,
      'modificado'
    );

    const prediccion = predecirEvento(historial, gdd_objetivo);

    if (prediccion) {
        predicciones[riesgo.nombre] = {
          nombre_cientifico: riesgo.nombre_cientifico,
          tipo: riesgo.tipo,
          base_termica: baseTermica,
          gdd_requeridos: gdd_objetivo,
          prediccion
        };
    }
  });

  return predicciones;
}

/**
 * Genera alertas basadas en umbrales
 */
export function generarAlertas(predicciones, umbral_alerta = 0.8) {
  const alertas = [];

  Object.entries(predicciones).forEach(([nombre, datos]) => {
    if(!datos.prediccion) return;
    
    // Evitar división por cero
    if (datos.gdd_requeridos === 0) return;

    const progreso = datos.prediccion.gdd_alcanzado / datos.gdd_requeridos;

    if (progreso >= 1.0) {
      alertas.push({
        nivel: 'CRÍTICO',
        riesgo: nombre,
        tipo: datos.tipo,
        mensaje: `${nombre}: Ciclo completo alcanzado. ¡Revisar cultivo!`,
        fecha: datos.prediccion.fecha_evento
      });
    } else if (progreso >= umbral_alerta) {
      alertas.push({
        nivel: 'ADVERTENCIA',
        riesgo: nombre,
        tipo: datos.tipo,
        mensaje: `${nombre}: ${(progreso * 100).toFixed(0)}% desarrollo.`,
        dias_restantes: datos.prediccion.dias_estimados_faltantes
      });
    }
  });

  return alertas.sort((a, b) => {
    const niveles = { CRÍTICO: 0, ADVERTENCIA: 1 };
    return niveles[a.nivel] - niveles[b.nivel];
  });
}

/**
 * Extrae la configuración de riesgos del JSON del cultivo
 */
export function cargarRiesgosDesdeJSON(cultivoData) {
  const riesgos = [];

  if (cultivoData?.riesgos_detallados) {
    Object.entries(cultivoData.riesgos_detallados).forEach(([nombre, datos]) => {
      if (datos.ciclo_desarrollo?.grados_dia_desarrollo) {
        riesgos.push({
          nombre,
          nombre_cientifico: datos.nombre_cientifico,
          tipo: datos.tipo,
          ciclo_desarrollo: datos.ciclo_desarrollo
        });
      }
    });
  }

  return riesgos;
}