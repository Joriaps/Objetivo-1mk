// logica.js — Las reglas de la app, SIN navegador: se pueden probar con `node --test`.
//
// Regla de oro heredada de Notas Rápidas: un fichero de datos de una versión MÁS NUEVA que la que entiendo
// no se interpreta ni se reescribe jamás (hacerlo borraría en silencio campos que esta versión no conoce).
//
// Cómo añadir una versión nueva del formato de datos:
//   1. Sube VERSION_ESQUEMA.
//   2. Añade en MIGRACIONES la función que convierte la versión anterior (clave = versión de origen).
//   3. Añade un test con un fichero de ejemplo de la versión anterior.
// Un campo nuevo con valor por defecto no necesita versión nueva.

export const VERSION_ESQUEMA = 1;
export const MAX_CANTIDAD = 999999;
export const MAX_SELECTOR = 999;
export const MAX_PUNTOS = 100000;   // por unidad (si los puntos son euros: hasta 100.000 € cada una)
export const METALES = ['bronce', 'plata', 'oro'];
export const MAX_TOTAL = 999999999;
export const MAX_TEXTO_IMPORTADO = 100000;

const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const COLOR_VALIDO = /^#[0-9a-f]{6}$/i;

const MIGRACIONES = {
  // 1: (datos) => ({ ...datos, version: 2, campoNuevo: 0 }),
};

export const acotar = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * Número entero con punto de millar SIEMPRE (5.556, 1.000, 1.100.489). No se usa toLocaleString porque el español
 * del navegador omite el punto en los de 4 cifras («5556»), y las tablas de ofertas se escriben con él.
 */
export function formatearNumero(n) {
  return (n < 0 ? '-' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
const entero = (v) => Number.isSafeInteger(v);

// Los mapas se crean SIN prototipo: así una clave como "constructor" no puede tocar nada heredado.
function copiar(origen) {
  const salida = Object.create(null);
  for (const k of Object.keys(origen)) salida[k] = origen[k];
  return salida;
}

// ───────────────────────── Configuración ─────────────────────────

/** Devuelve la lista de errores de config.js (vacía si todo está bien). `efectos` = nombres de animaciones que existen. */
export function validarConfig(botones, hitos, efectos = null) {
  const errores = [];
  if (!Array.isArray(botones) || botones.length === 0) {
    errores.push('Hace falta al menos un botón en BOTONES.');
    botones = [];
  }
  const vistos = new Set();
  botones.forEach((b, i) => {
    const donde = `BOTONES[${i}]`;
    if (!b || typeof b !== 'object') { errores.push(`${donde} no es un objeto.`); return; }
    if (typeof b.id !== 'string' || !ID_VALIDO.test(b.id)) errores.push(`${donde}.id debe tener letras, números o guiones (máx. 32): ${b.id}`);
    else if (vistos.has(b.id)) errores.push(`${donde}.id repetido: ${b.id}`);
    else vistos.add(b.id);
    if (typeof b.nombre !== 'string' || !b.nombre.trim() || b.nombre.length > 40) errores.push(`${donde}.nombre debe ser un texto de 1 a 40 caracteres.`);
    if (typeof b.color !== 'string' || !COLOR_VALIDO.test(b.color)) errores.push(`${donde}.color debe ser como #FF5C8A.`);
    if (!entero(b.objetivo) || b.objetivo < 1 || b.objetivo > MAX_CANTIDAD) errores.push(`${donde}.objetivo debe ser un entero de 1 a ${MAX_CANTIDAD}.`);
    if (!entero(b.puntos) || b.puntos < 1 || b.puntos > MAX_PUNTOS) errores.push(`${donde}.puntos debe ser un entero de 1 a ${MAX_PUNTOS}.`);
  });
  if (!Array.isArray(hitos)) {
    errores.push('HITOS debe ser una lista.');
  } else {
    const porcentajes = new Set();
    hitos.forEach((x, i) => {
      const donde = `HITOS[${i}]`;
      if (!x || typeof x !== 'object') { errores.push(`${donde} no es un objeto.`); return; }
      if (!entero(x.porcentaje) || x.porcentaje < 1 || x.porcentaje > 100) errores.push(`${donde}.porcentaje debe ser un entero de 1 a 100.`);
      else if (porcentajes.has(x.porcentaje)) errores.push(`${donde}.porcentaje repetido: ${x.porcentaje}`);
      else porcentajes.add(x.porcentaje);
      if (typeof x.efecto !== 'string') errores.push(`${donde}.efecto debe ser un nombre de animación.`);
      else if (efectos && !efectos.includes(x.efecto)) errores.push(`${donde}.efecto «${x.efecto}» no existe en efectos.js (hay: ${efectos.join(', ')}).`);
      if (typeof x.titulo !== 'string' || !x.titulo.trim()) errores.push(`${donde}.titulo debe ser un texto.`);
      if (x.opciones !== undefined) {
        if (!x.opciones || typeof x.opciones !== 'object' || Array.isArray(x.opciones)) {
          errores.push(`${donde}.opciones debe ser un objeto, por ejemplo { metal: 'oro' } o { intensidad: 2 }.`);
        } else {
          if (x.opciones.metal !== undefined && !METALES.includes(x.opciones.metal)) errores.push(`${donde}.opciones.metal debe ser: ${METALES.join(', ')}.`);
          if (x.opciones.intensidad !== undefined && !(entero(x.opciones.intensidad) && x.opciones.intensidad >= 1 && x.opciones.intensidad <= 3)) errores.push(`${donde}.opciones.intensidad debe ser 1, 2 o 3.`);
        }
      }
      if (x.efecto === 'medalla' && !(x.opciones && METALES.includes(x.opciones.metal))) errores.push(`${donde}: la animación «medalla» necesita opciones: { metal: 'bronce' | 'plata' | 'oro' }.`);
    });
  }
  return errores;
}

// ───────────────────────── Estado ─────────────────────────

export function estadoInicial() {
  return {
    version: VERSION_ESQUEMA,
    cantidades: Object.create(null),
    objetivos: Object.create(null),
    ajuste: 0,
    preferencias: { vibracion: true, animaciones: true },
  };
}

export const cantidadDe = (estado, id) => estado.cantidades[id] ?? 0;
export const objetivoDe = (boton, estado) => estado.objetivos[boton.id] ?? boton.objetivo;

/** Suma de cantidad × puntos de los botones que hay en la configuración (los quitados de config.js no cuentan). */
export function totalCalculado(botones, estado) {
  let total = 0;
  for (const b of botones) total += cantidadDe(estado, b.id) * b.puntos;
  return total;
}

/** Calculado + ajuste manual. Puede ser negativo si el ajuste es negativo y luego se restan contadores: se muestra tal cual. */
export const totalFinal = (botones, estado) => totalCalculado(botones, estado) + estado.ajuste;

/**
 * Suma o resta `delta` a un botón. La cantidad nunca baja de 0 ni sube de MAX_CANTIDAD.
 * `aplicado` es lo que realmente cambió; `recortado` avisa de que se pidió más de lo posible.
 */
export function aplicarCantidad(estado, id, delta) {
  const antes = cantidadDe(estado, id);
  if (!entero(delta)) return { estado, antes, despues: antes, aplicado: 0, recortado: false };
  const bruto = antes + delta;
  const despues = acotar(bruto, 0, MAX_CANTIDAD);
  if (despues === antes) return { estado, antes, despues, aplicado: 0, recortado: despues !== bruto };
  const cantidades = copiar(estado.cantidades);
  cantidades[id] = despues;
  return { estado: { ...estado, cantidades }, antes, despues, aplicado: despues - antes, recortado: despues !== bruto };
}

/** Pone el total a mano guardando la DIFERENCIA (ajuste); los contadores no se tocan. */
export function fijarTotal(botones, estado, deseado) {
  if (!entero(deseado) || deseado < 0 || deseado > MAX_TOTAL) return { ok: false, estado, motivo: 'El total debe ser un número entero entre 0 y ' + MAX_TOTAL + '.' };
  return { ok: true, estado: { ...estado, ajuste: deseado - totalCalculado(botones, estado) } };
}

export const quitarAjuste = (estado) => ({ ...estado, ajuste: 0 });

export function fijarObjetivo(estado, id, valor) {
  if (!entero(valor) || valor < 1 || valor > MAX_CANTIDAD) return null;
  const objetivos = copiar(estado.objetivos);
  objetivos[id] = valor;
  return { ...estado, objetivos };
}

export const restablecerObjetivos = (estado) => ({ ...estado, objetivos: Object.create(null) });

/** Borra cantidades y ajuste; conserva objetivos y preferencias. */
export const reiniciarContadores = (estado) => ({ ...estado, cantidades: Object.create(null), ajuste: 0 });

export function fijarPreferencia(estado, clave, valor) {
  if (clave !== 'vibracion' && clave !== 'animaciones') return estado;
  return { ...estado, preferencias: { ...estado.preferencias, [clave]: Boolean(valor) } };
}

// ───────────────────────── Progreso y celebraciones ─────────────────────────

/**
 * Una fila por botón. `porcentaje` es entero y solo llega a 100 cuando está completo (no redondea hacia arriba).
 * Con `hitos` también indica la `medalla` que lleva ese botón (o null).
 */
export function progreso(botones, estado, hitos = []) {
  return botones.map((b) => {
    const cantidad = cantidadDe(estado, b.id);
    const objetivo = objetivoDe(b, estado);
    const real = (cantidad / objetivo) * 100;
    return {
      id: b.id, nombre: b.nombre, color: b.color, puntos: b.puntos,
      cantidad, objetivo,
      porcentaje: Math.min(100, Math.floor(real)),
      completado: cantidad >= objetivo,
      falta: Math.max(0, objetivo - cantidad),
      medalla: medallaDe(cantidad, objetivo, hitos),
    };
  });
}

/** Avance global 0..1: lo conseguido (sin pasarse del objetivo de cada botón) sobre la suma de objetivos. */
export function progresoGlobal(botones, estado) {
  let hecho = 0;
  let meta = 0;
  for (const b of botones) {
    const objetivo = objetivoDe(b, estado);
    hecho += Math.min(cantidadDe(estado, b.id), objetivo);
    meta += objetivo;
  }
  return meta === 0 ? 0 : hecho / meta;
}

/** Unidades que hacen falta para llegar a `porcentaje` % de `objetivo` (redondeado, mínimo 1). */
export const umbralDe = (objetivo, porcentaje) => Math.max(1, Math.round((objetivo * porcentaje) / 100));

/**
 * La celebración que toca al pasar de `antes` a `despues` unidades. Si se cruzan varios hitos de golpe,
 * gana el de mayor porcentaje (como en Android, donde la final manda sobre las intermedias).
 * Solo se celebra al SUBIR.
 */
export function hitoAlcanzado(antes, despues, objetivo, hitos) {
  if (!(despues > antes)) return null;
  let mejor = null;
  for (const h of hitos) {
    const umbral = umbralDe(objetivo, h.porcentaje);
    if (antes < umbral && despues >= umbral && (!mejor || h.porcentaje > mejor.porcentaje)) mejor = h;
  }
  return mejor;
}

/**
 * La mejor medalla ('bronce' | 'plata' | 'oro') que corresponde a `cantidad` de `objetivo`, o null si aún no hay ninguna.
 * Las medallas son los hitos que llevan `opciones.metal` en config.js.
 */
export function medallaDe(cantidad, objetivo, hitos) {
  let mejor = null;
  for (const h of hitos) {
    const metal = h.opciones && h.opciones.metal;
    if (metal && cantidad >= umbralDe(objetivo, h.porcentaje) && (!mejor || h.porcentaje > mejor.porcentaje)) mejor = h;
  }
  return mejor ? mejor.opciones.metal : null;
}

/** Blanco o casi negro, el que mejor contraste dé sobre `hex` (texto de los botones de color). */
export function colorTexto(hex) {
  const canal = (i) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
  const conBlanco = 1.05 / (L + 0.05);
  const conOscuro = (L + 0.05) / (0.0066 + 0.05);
  return conBlanco >= conOscuro ? '#ffffff' : '#14131a';
}

// ───────────────────────── Guardar / leer / importar ─────────────────────────

export function serializar(estado, legible = false) {
  return JSON.stringify({
    version: VERSION_ESQUEMA,
    cantidades: estado.cantidades,
    objetivos: estado.objetivos,
    ajuste: estado.ajuste,
    preferencias: estado.preferencias,
  }, null, legible ? 2 : 0);
}

function limpiarMapa(origen, min, max, descartes) {
  const salida = Object.create(null);
  if (origen === undefined) return salida;
  if (origen === null || typeof origen !== 'object' || Array.isArray(origen)) { descartes.n++; return salida; }
  for (const k of Object.keys(origen)) {
    const v = origen[k];
    if (ID_VALIDO.test(k) && entero(v)) salida[k] = acotar(v, min, max);
    else descartes.n++;
  }
  return salida;
}

/**
 * Lee un texto (del disco o de una copia pegada). Nunca lanza.
 *   { tipo: 'ok', estado, descartados }   -> válido (los valores raros se limpian y se cuentan)
 *   { tipo: 'versionFutura', version }    -> de una versión más nueva: NO tocar
 *   { tipo: 'invalido' }                  -> no es un fichero de esta app
 */
export function interpretar(texto) {
  if (typeof texto !== 'string' || texto.length > MAX_TEXTO_IMPORTADO) return { tipo: 'invalido' };
  let datos;
  try { datos = JSON.parse(texto); } catch { return { tipo: 'invalido' }; }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return { tipo: 'invalido' };
  const version = datos.version;
  if (!entero(version) || version < 1) return { tipo: 'invalido' };
  if (version > VERSION_ESQUEMA) return { tipo: 'versionFutura', version };
  for (let v = version; v < VERSION_ESQUEMA; v++) datos = MIGRACIONES[v](datos);

  const descartes = { n: 0 };
  const estado = estadoInicial();
  estado.cantidades = limpiarMapa(datos.cantidades, 0, MAX_CANTIDAD, descartes);
  estado.objetivos = limpiarMapa(datos.objetivos, 1, MAX_CANTIDAD, descartes);
  if (datos.ajuste !== undefined) {
    if (entero(datos.ajuste)) estado.ajuste = acotar(datos.ajuste, -MAX_TOTAL, MAX_TOTAL);
    else descartes.n++;
  }
  const p = datos.preferencias;
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    if (typeof p.vibracion === 'boolean') estado.preferencias.vibracion = p.vibracion;
    if (typeof p.animaciones === 'boolean') estado.preferencias.animaciones = p.animaciones;
  }
  return { tipo: 'ok', estado, descartados: descartes.n };
}
