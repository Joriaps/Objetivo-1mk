// estado.js — Guardar y leer los datos en el almacenamiento del navegador (localStorage).
// Recibe el almacenamiento como parámetro para poder probarlo con uno falso.

import { estadoInicial, interpretar, serializar } from './logica.js';

export const CLAVE = 'objetivo1mk:estado';
export const CLAVE_ILEGIBLE = 'objetivo1mk:copia-ilegible';

export function crearAlmacen(almacenamiento) {
  let soloLectura = false;

  /**
   * Devuelve { estado, aviso, version?, descartados? }. `aviso`:
   *   null            todo bien (o no había nada guardado)
   *   'versionFutura' los datos son de una versión más nueva: el almacén pasa a SOLO LECTURA y no escribe nada
   *   'ilegible'      los datos no se pudieron leer: se aparta una copia y se empieza de cero
   *   'descartados'   se leyó, pero se ignoraron valores no válidos
   */
  function cargar() {
    let texto = null;
    try { texto = almacenamiento ? almacenamiento.getItem(CLAVE) : null; } catch { texto = null; }
    if (texto === null || texto === undefined) return { estado: estadoInicial(), aviso: null };

    const r = interpretar(texto);
    if (r.tipo === 'ok') return { estado: r.estado, aviso: r.descartados > 0 ? 'descartados' : null, descartados: r.descartados };
    if (r.tipo === 'versionFutura') {
      soloLectura = true;
      return { estado: estadoInicial(), aviso: 'versionFutura', version: r.version };
    }
    // Ilegible: se guarda aparte ANTES de borrar el original (si la copia falla, el original se queda).
    try {
      almacenamiento.setItem(CLAVE_ILEGIBLE, texto);
      almacenamiento.removeItem(CLAVE);
    } catch { /* sin espacio: se deja el original donde está */ }
    return { estado: estadoInicial(), aviso: 'ilegible' };
  }

  /** { ok:true } o { ok:false, motivo: 'soloLectura' | 'sinAlmacenamiento' | 'error' } */
  function guardar(estado) {
    if (soloLectura) return { ok: false, motivo: 'soloLectura' };
    if (!almacenamiento) return { ok: false, motivo: 'sinAlmacenamiento' };
    try {
      almacenamiento.setItem(CLAVE, serializar(estado));
      return { ok: true };
    } catch {
      return { ok: false, motivo: 'error' };
    }
  }

  return { cargar, guardar, get soloLectura() { return soloLectura; } };
}
