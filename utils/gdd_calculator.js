// ============================================================================
// CALCULADORA DE GRADOS-DÍA ACUMULADOS (GDD) - VERSIÓN REACT NATIVE
// ============================================================================
// Utilidad pura para calcular riesgos en la App móvil.
// ============================================================================

/**
 * Calcula Grados-Día (GDD) para un día usando el método simple
 */
export function calcularGDD_Simple(tmax, tmin, baseTermica, umbralSuperior = null) {
  if (umbralSuperior) {
    if (tmax > umbralSuperior) tmax = umbralSuperior;
    if (tmin > umbralSuperior) tmin = umbralSuperior;
  }
  
  const tPromedio = (tmax + tmin) / 2;
  const gdd = Math.max(0, tPromedio - baseTermica);
  
  return gdd;
}

/**
 * Calcula Grados-Día usando el método modificado (más preciso)
 */
export function calcularGDD_Modificado(tmax, tmin, baseTermica, umbralSuperior = null) {
  if (umbralSuperior) {
    tmax = Math.min(tmax, umbralSuperior);
    tmin = Math.min(tmin, umbralSuperior);
  }
  
  if (tmax < baseTermica) return 0;
  
  if (tmin < baseTermica) {
    tmin = baseTermica;
  }
  
  const tPromedio = (tmax + tmin) / 2;
  const gdd = Math.max(0, tPromedio - baseTermica);
  
  return gdd;
}

/**
 * Acumula GDD a lo largo de varios días
 */
export function acumularGDD(datos_climaticos, baseTermica, umbralSuperior = null, metodo = 'modificado') {
  let gdd_acumulado = 0;
  const calculador = metodo === 'simple' ? calcularGDD_Simple : calcularGDD_Modificado;
  
  return datos_climaticos.map(dia => {
    // Aseguramos que los datos sean números
    const tmax = parseFloat(dia.tmax);
    const tmin = parseFloat(dia.tmin);
    
    const gdd_diario = calculador(tmax, tmin, baseTermica, umbralSuperior);
    gdd_acumulado += gdd_diario;
    
    return {
      fecha: dia.fecha,
      tmax: tmax,
      tmin: tmin,
      gdd_diario: parseFloat(gdd_diario.toFixed(2)),
      gdd_acumulado: parseFloat(gdd_acumulado.toFixed(2))
    };
  });
}

/**
 * Predice cuándo ocurrirá un evento basado en GDD
 */
export function predecirEvento(historial_gdd, gdd_objetivo) {
  for (let i = 0; i < historial_gdd.length; i++) {
    const dia = historial_gdd[i];
    
    if (dia.gdd_acumulado >= gdd_objetivo) {
      return {
        fecha_evento: dia.fecha,
        gdd_alcanzado: dia.gdd_acumulado,
        dias_desde_inicio: i + 1,
        mensaje: `Evento predicho para ${dia.fecha}`
      };
    }
  }
  
  // Si no se alcanza el objetivo con los datos actuales
  const ultimo = historial_gdd[historial_gdd.length - 1];
  const gdd_faltantes = gdd_objetivo - ultimo.gdd_acumulado;
  
  // Evitar división por cero
  const gdd_promedio = historial_gdd.length > 0 ? ultimo.gdd_acumulado / historial_gdd.length : 0;
  
  const dias_faltantes = gdd_promedio > 0 ? Math.ceil(gdd_faltantes / gdd_promedio) : 999;
  
  return {
    fecha_evento: null,
    gdd_alcanzado: ultimo.gdd_acumulado,
    gdd_faltantes: gdd_faltantes,
    dias_estimados_faltantes: dias_faltantes,
    mensaje: `Faltan ${gdd_faltantes.toFixed(0)} GDD (~${dias_faltantes} días)`
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
    const umbral = gdd.umbral_superior ? parseFloat(gdd.umbral_superior) : null;
    
    // Parseo robusto del objetivo (ej: "450-550" toma 450)
    let gdd_objetivo = 0;
    if (typeof gdd.gdd_ciclo_completo === 'string') {
        gdd_objetivo = parseFloat(gdd.gdd_ciclo_completo.split('-')[0]);
    } else {
        gdd_objetivo = parseFloat(gdd.gdd_ciclo_completo);
    }
    
    const historial = acumularGDD(datos_climaticos, baseTermica, umbral, 'modificado');
    const prediccion = predecirEvento(historial, gdd_objetivo);
    
    predicciones[riesgo.nombre] = {
      nombre_cientifico: riesgo.nombre_cientifico,
      tipo: riesgo.tipo,
      base_termica: baseTermica,
      gdd_requeridos: gdd_objetivo,
      prediccion: prediccion,
      // historial_gdd: historial // Comentado para ahorrar memoria en el celular si no se usa gráfica
    };
  });
  
  return predicciones;
}

/**
 * Genera alertas basadas en umbrales
 */
export function generarAlertas(predicciones, umbral_alerta = 0.8) {
  const alertas = [];
  
  Object.entries(predicciones).forEach(([nombre, datos]) => {
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
        mensaje: `${nombre}: ${(progreso * 100).toFixed(0)}% desarrollo. Riesgo alto en ${datos.prediccion.dias_estimados_faltantes} días.`,
        dias_restantes: datos.prediccion.dias_estimados_faltantes
      });
    }
  });
  
  return alertas.sort((a, b) => {
    const niveles = { 'CRÍTICO': 0, 'ADVERTENCIA': 1 };
    return niveles[a.nivel] - niveles[b.nivel];
  });
}

/**
 * Extrae la configuración de riesgos del JSON del cultivo
 */
export function cargarRiesgosDesdeJSON(cultivoData) {
  const riesgos = [];
  
  if (cultivoData && cultivoData.riesgos_detallados) {
    Object.entries(cultivoData.riesgos_detallados).forEach(([nombre, datos]) => {
      if (datos.ciclo_desarrollo?.grados_dia_desarrollo) {
        riesgos.push({
          nombre: nombre,
          nombre_cientifico: datos.nombre_cientifico,
          tipo: datos.tipo,
          ciclo_desarrollo: datos.ciclo_desarrollo
        });
      }
    });
  }
  
  return riesgos;
}

/**
 * FUNCIÓN PRINCIPAL PARA EL HOMESCREEN
 * Recibe el objeto del cultivo y el array de clima formateado
 */
export function analizarCultivoCompleto(cultivoData, datosMeteorologicos) {
  // 1. Cargar riesgos
  const riesgos = cargarRiesgosDesdeJSON(cultivoData);
  
  if (riesgos.length === 0) {
    return { predicciones: {}, alertas: [] };
  }
  
  // 2. Calcular matemática
  const predicciones = calcularRiesgosMultiples(datosMeteorologicos, riesgos);
  
  // 3. Generar alertas (Umbral 75%)
  const alertas = generarAlertas(predicciones, 0.75);
  
  // 4. Retornar objeto limpio para la UI
  return { predicciones, alertas };
}