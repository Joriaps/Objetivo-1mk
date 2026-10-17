// interfaz.js — Dibuja las pantallas y conecta los botones con las reglas de logica.js.
// Reglas de este archivo: (1) todo el texto entra con textContent, NUNCA con innerHTML; (2) las decisiones
// (totales, progreso, qué celebración toca) viven en logica.js; aquí solo se dibuja; (3) las pantallas se
// construyen UNA vez y `refrescar()` solo cambia los valores, para no perder el foco al escribir.

import {
  MAX_CANTIDAD, MAX_SELECTOR, MAX_TOTAL, MAX_TEXTO_IMPORTADO,
  acotar, aplicarCantidad, cantidadDe, colorTexto, fijarObjetivo, formatearNumero, fijarPreferencia, fijarTotal, hitoAlcanzado, interpretar,
  medallaDe, objetivoDe, progreso, progresoGlobal, quitarAjuste, reiniciarContadores, restablecerObjetivos, serializar,
  totalCalculado, totalFinal,
} from './logica.js';
import { CLAVE } from './estado.js';

const $ = (id) => document.getElementById(id);
const numero = formatearNumero;
const conSigno = (n) => (n > 0 ? `+${numero(n)}` : n < 0 ? `−${numero(-n)}` : '0');
const eslugan = (texto) => texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'copia';

/** Crea un elemento. Los hijos de tipo texto se añaden como texto (nunca como HTML). */
function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'estilo') for (const [p, valor] of Object.entries(v)) el.style.setProperty(p, valor);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const hijo of hijos.flat()) if (hijo !== undefined && hijo !== null && hijo !== false) el.append(hijo);
  return el;
}

export function iniciar({ botones, hitos, app, almacen, reproductor, entorno }) {
  let { estado, aviso, version, descartados } = almacen.cargar();

  if (almacen.soloLectura) { mostrarIncompatible(); return; }

  const sel = new Map(botones.map((b) => [b.id, 1]));     // cantidad elegida en cada selector (no se guarda)
  const refs = { tarjetas: new Map(), tabla: new Map(), objetivos: new Map() };
  let mostrado = 0;                                       // número del total tal como se ve ahora mismo
  let animacionNumero = 0;
  let temporizadorAviso = 0;
  const fichas = new Map();                               // id -> nº de la última celebración con medalla de esa tarjeta
  const pendientes = new Set();                           // tarjetas cuya medalla aún está volando: su insignia aparece al llegar

  // Los totales llevan la unidad de config.js (p. ej. «€»); si no hay unidad, son puntos sin más.
  const unidad = app.unidad || '';
  const conUnidad = (n) => (unidad ? `${numero(n)} ${unidad}` : numero(n));
  const conSignoUnidad = (n) => (unidad && n !== 0 ? `${conSigno(n)} ${unidad}` : conSigno(n));

  const animar = () => estado.preferencias.animaciones && !entorno.reducirMovimiento();
  const vibrar = (ms) => { if (estado.preferencias.vibracion && entorno.vibracion) navigator.vibrate(ms); };

  // ───────────── Avisos y diálogo ─────────────

  function aviso_(texto) {
    const el = $('toast');
    clearTimeout(temporizadorAviso);
    el.textContent = '';
    setTimeout(() => { el.textContent = texto; el.classList.add('visible'); }, 30);
    temporizadorAviso = setTimeout(() => el.classList.remove('visible'), 3600);
  }

  function confirmar({ titulo, mensaje, aceptar = 'Aceptar' }) {
    const dialogo = $('dialogo');
    if (typeof dialogo.showModal !== 'function') return Promise.resolve(window.confirm(`${titulo}\n\n${mensaje}`));
    $('dialogo-titulo').textContent = titulo;
    $('dialogo-texto').textContent = mensaje;
    $('dialogo-aceptar').textContent = aceptar;
    return new Promise((resolver) => {
      const cerrar = (valor) => { dialogo.close(valor); };
      $('dialogo-aceptar').onclick = () => cerrar('si');
      $('dialogo-cancelar').onclick = () => cerrar('no');
      dialogo.onclose = () => resolver(dialogo.returnValue === 'si');
      dialogo.returnValue = 'no';
      dialogo.showModal();
      $('dialogo-cancelar').focus();
    });
  }

  function mostrarIncompatible() {
    $('aplicacion').hidden = true;
    $('incompatible').hidden = false;
  }

  // ───────────── Cambiar el estado ─────────────

  function commit(nuevo, { animarTotal = true } = {}) {
    estado = nuevo;
    const r = almacen.guardar(estado);
    pintarAvisoGuardado(r);
    refrescar({ animarTotal });
  }

  function pintarAvisoGuardado(r) {
    const chip = $('aviso-guardado');
    if (r.ok) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.textContent = r.motivo === 'error' ? 'No se pudo guardar' : 'Sin guardado (modo privado)';
  }

  // ───────────── Pantalla CONTAR ─────────────

  // El dinero que llevamos es LO importante: cifra enorme a todo el ancho del panel, con el avance global debajo.
  const totalNum = h('span', { class: 'total__num', id: 'total-num' }, '0');
  const totalGlobal = h('span', { class: 'total__global' });
  const totalDetalle = h('p', { class: 'total__detalle', hidden: true });
  // La barra es decoración (aria-hidden); lo que leen los lectores de pantalla es `totalLeido`, que solo se
  // actualiza con el valor FINAL (no durante la animación del número).
  const totalLeido = h('p', { class: 'visualmente-oculto' });
  const totalRelleno = h('div', { class: 'relleno' });
  const totalBarra = h('div', { class: 'barra total__barra', 'aria-hidden': 'true' }, totalRelleno);
  const cabeceraChip = $('total-cabecera');   // el mismo total, fijo en la cabecera cuando el panel no se ve
  const panelTotal = h('section', { class: 'total', 'aria-labelledby': 'total-titulo' },
    h('div', { class: 'total__fila' }, h('h2', { class: 'total__etiqueta', id: 'total-titulo' }, 'Puntuación total'), totalGlobal),
    h('div', { class: 'total__cifra' }, totalNum, unidad ? h('span', { class: 'total__unidad' }, unidad) : null),
    totalBarra, totalDetalle, totalLeido);

  function crearTarjeta(b) {
    const cantidad = h('span', { class: 'tarjeta__cantidad' });
    const insignia = h('span', { class: 'insignia', hidden: true }, '✓ Objetivo conseguido');
    const relleno = h('div', { class: 'relleno' });
    const barra = h('div', { class: 'barra', role: 'progressbar', 'aria-label': `Progreso de ${b.nombre}`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, relleno);

    const menos = h('button', { class: 'selector__boton', type: 'button', 'aria-label': `Bajar la cantidad elegida para ${b.nombre}`, onclick: () => cambiarSel(b.id, -1) }, '−');
    const mas = h('button', { class: 'selector__boton', type: 'button', 'aria-label': `Subir la cantidad elegida para ${b.nombre}`, onclick: () => cambiarSel(b.id, 1) }, '+');
    const input = h('input', {
      class: 'selector__valor', type: 'text', inputmode: 'numeric', pattern: '-?[0-9]*', autocomplete: 'off',
      value: '1', 'aria-label': `Cantidad a sumar o restar en ${b.nombre}`,
    });
    const guardarBtn = h('button', { class: 'boton boton--guardar', type: 'button', onclick: () => guardar(b.id) });
    const accion = h('div', { class: 'accion' }, guardarBtn);
    // Medalla fija en la esquina de la tarjeta (bronce / plata / oro según el avance). Siempre está en el DOM para que la
    // animación sepa adónde volar; se muestra o se oculta con una clase.
    const medalla = h('span', { class: 'medalla medalla--oculta', role: 'img', 'aria-hidden': 'true' });

    input.addEventListener('input', () => {
      // Solo cifras y un «-» al principio; máximo 5 caracteres (así un texto larguísimo pegado no da Infinity).
      let limpio = input.value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '').slice(0, 5);
      const n = parseInt(limpio, 10);
      const valor = Number.isFinite(n) ? acotar(n, -MAX_SELECTOR, MAX_SELECTOR) : 0;
      if (Number.isFinite(n) && valor !== n) limpio = String(valor);   // lo que se ve coincide con lo que se guardará
      if (limpio !== input.value) input.value = limpio;
      sel.set(b.id, valor);
      pintarSelector(b.id);
    });
    input.addEventListener('blur', () => fijarSel(b.id, sel.get(b.id)));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(b.id); } });

    const raiz = h('article', { class: 'tarjeta', estilo: { '--c': b.color, '--c-texto': colorTexto(b.color) } },
      h('div', { class: 'tarjeta__cabecera' },
        h('h3', { class: 'tarjeta__nombre' }, h('span', { class: 'punto' }), h('span', { class: 'tarjeta__nombre-texto' }, b.nombre), b.puntos !== 1 ? h('span', { class: 'puntos' }, unidad ? `${numero(b.puntos)} ${unidad}/ud.` : `×${numero(b.puntos)} pts`) : null),
        cantidad),
      insignia, barra,
      h('div', { class: 'controles' }, h('div', { class: 'selector', role: 'group', 'aria-label': `Cantidad para ${b.nombre}` }, menos, input, mas), accion),
      medalla);

    refs.tarjetas.set(b.id, { raiz, cantidad, insignia, relleno, barra, input, menos, mas, guardar: guardarBtn, accion, medalla });
    return raiz;
  }

  const listaTarjetas = h('div', { class: 'lista' }, botones.map(crearTarjeta));

  const ayudaIOS = h('div', { class: 'ayuda', role: 'note' },
    h('p', {}, 'Para instalarla en el iPhone: abre esta página en Safari, pulsa Compartir (el cuadrado con la flecha) y elige «Añadir a pantalla de inicio». Después úsala siempre desde su icono: los datos de Safari y los del icono no se comparten.'),
    h('button', { class: 'boton boton--sec', type: 'button', onclick: () => { ayudaIOS.hidden = true; recordar('ayuda-ios', '1'); } }, 'Entendido'));
  ayudaIOS.hidden = !(entorno.esIOS && !entorno.instalada && recordado('ayuda-ios') !== '1');

  $('vista-contar').append(ayudaIOS, panelTotal, listaTarjetas);

  function pintarSelector(id) {
    const r = refs.tarjetas.get(id);
    const n = sel.get(id);
    r.guardar.textContent = n > 0 ? `Sumar ${numero(n)}` : n < 0 ? `Restar ${numero(-n)}` : 'Guardar';
    r.guardar.disabled = n === 0;
    r.guardar.classList.toggle('boton--restar', n < 0);
    r.menos.disabled = n <= -MAX_SELECTOR;
    r.mas.disabled = n >= MAX_SELECTOR;
  }

  function fijarSel(id, n) {
    sel.set(id, n);
    refs.tarjetas.get(id).input.value = String(n);
    pintarSelector(id);
  }

  function cambiarSel(id, delta) { fijarSel(id, acotar(sel.get(id) + delta, -MAX_SELECTOR, MAX_SELECTOR)); }

  function guardar(id) {
    const b = botones.find((x) => x.id === id);
    const n = sel.get(id);
    if (n === 0) return;
    const r = aplicarCantidad(estado, id, n);
    if (r.aplicado === 0) {
      aviso_(r.recortado ? `${b.nombre} ya está en ${numero(r.despues)}: no se puede ${n < 0 ? 'restar' : 'sumar'} más.` : 'No hay nada que guardar.');
      return;
    }
    // El hito se calcula ANTES de guardar: si trae medalla, su insignia fija no debe aparecer hasta que la medalla llegue.
    const objetivo = objetivoDe(b, estado);
    const hito = hitoAlcanzado(r.antes, r.despues, objetivo, hitos);
    const conMedalla = Boolean(hito && hito.opciones && hito.opciones.metal) && animar();
    if (conMedalla) pendientes.add(id);

    commit(r.estado);
    fijarSel(id, 1);

    const t = refs.tarjetas.get(id);
    if (animar()) {
      t.cantidad.classList.remove('pulso');
      void t.cantidad.offsetWidth;          // reinicia la animación aunque se pulse seguido
      t.cantidad.classList.add('pulso');
      const onda = h('span', { class: 'onda' });
      onda.addEventListener('animationend', () => onda.remove());
      t.accion.append(onda);
    }
    vibrar(15);

    aviso_(`${conSigno(r.aplicado)} en ${b.nombre}${r.recortado ? ' (no baja de 0)' : ''}. Total: ${conUnidad(totalFinal(botones, estado))}`);

    const mia = (fichas.get(id) ?? 0) + 1;
    fichas.set(id, mia);                                    // el aviso de una celebración ANTERIOR ya no destapa la insignia
    const revelarInsignia = () => {
      if (fichas.get(id) !== mia) return;
      if (pendientes.delete(id)) pintarMedalla(id, medallaDe(cantidadDe(estado, id), objetivoDe(b, estado), hitos), true);
    };
    if (hito) {
      reproductor.reproducir(hito.efecto, {
        titulo: hito.titulo,
        subtitulo: `${b.nombre}: ${numero(r.despues)} / ${numero(objetivo)}`,
        animar: animar(),
        vibrar: estado.preferencias.vibracion && entorno.vibracion ? (ms) => navigator.vibrate(ms) : null,
        exclusivo: Boolean(hito.exclusivo),
        escena: construirEscena(id, hito.porcentaje),
        opciones: hito.opciones,
        // La insignia fija aparece cuando la MEDALLA llega a su sitio (no cuando acaba todo el espectáculo).
        alInsignia: revelarInsignia,
        alTerminar: revelarInsignia,
      });
    }
  }

  /** Dónde ocurre el logro, para que la animación salga de ahí: la tarjeta, el sitio de su medalla y el destino de las monedas. */
  function construirEscena(id, porcentaje) {
    const t = refs.tarjetas.get(id);
    const b = botones.find((x) => x.id === id);
    const r = t.raiz.getBoundingClientRect();
    const m = t.medalla.getBoundingClientRect();
    const num = totalNum.getBoundingClientRect();
    actualizarCabecera();
    let total;
    if (cifraVisible()) {
      total = { x: num.left + num.width / 2, y: num.top + num.height / 2 };       // la cifra grande, si se ve
    } else if (!cabeceraChip.hidden) {
      const c = cabeceraChip.getBoundingClientRect();
      total = { x: c.left + c.width / 2, y: c.top + c.height / 2 };               // si no, el total fijo de la cabecera
    } else {
      total = { x: window.innerWidth / 2, y: 36 };
    }
    return {
      origen: { x: r.left, y: r.top, ancho: r.width, alto: r.height },
      insignia: { x: m.left + m.width / 2, y: m.top + m.height / 2, r: 14 },
      total, color: b.color, unidad, porcentaje,
    };
  }

  /** Muestra u oculta la medalla fija de una tarjeta (no la muestra mientras su medalla animada aún vuela). */
  function pintarMedalla(id, metal, conAnimacion = false) {
    const m = refs.tarjetas.get(id).medalla;
    const visible = Boolean(metal) && !pendientes.has(id);
    m.dataset.metal = metal || '';
    m.classList.toggle('medalla--oculta', !visible);
    m.setAttribute('aria-hidden', visible ? 'false' : 'true');
    m.setAttribute('aria-label', metal ? `Medalla de ${metal}` : '');
    if (visible && conAnimacion) {
      m.classList.remove('medalla--aparece');
      void m.offsetWidth;
      m.classList.add('medalla--aparece');
    }
  }


  // ───────────── Pantalla PROGRESO ─────────────

  const cuerpoTabla = h('tbody');
  for (const b of botones) {
    const hay = h('td', { class: 'num' });
    const objetivo = h('td', { class: 'num' });
    const pct = h('span', { class: 'porcentaje' });
    const relleno = h('div', { class: 'relleno' });
    const barra = h('div', { class: 'barra', role: 'progressbar', 'aria-label': `Progreso de ${b.nombre}`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, relleno);
    const marca = h('span', { class: 'hecho', hidden: true, 'aria-label': 'completado' }, ' ✓');
    cuerpoTabla.append(h('tr', { estilo: { '--c': b.color } },
      h('th', { scope: 'row' }, h('div', { class: 'celda-nombre' }, h('span', { class: 'punto' }), h('span', {}, b.nombre, marca))),
      hay, objetivo, h('td', { class: 'celda-progreso' }, pct, barra)));
    refs.tabla.set(b.id, { hay, objetivo, pct, relleno, barra, marca });
  }
  // El pie reparte sus celdas de dos en dos columnas: una cifra larga («1.100.489 €») no puede ensanchar la columna de Progreso.
  const pieGlobal = h('td', { class: 'num', colspan: 2 });
  const pieTotal = h('td', { class: 'num', colspan: 2 });
  const tabla = h('table', {},
    h('caption', { class: 'visualmente-oculto' }, 'Progreso de cada botón'),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Botón'), h('th', { scope: 'col', class: 'num' }, 'Hay'), h('th', { scope: 'col', class: 'num' }, 'Objetivo'), h('th', { scope: 'col' }, 'Progreso'))),
    cuerpoTabla,
    h('tfoot', {},
      h('tr', {}, h('th', { scope: 'row', colspan: 2 }, 'Progreso global'), pieGlobal),
      h('tr', {}, h('th', { scope: 'row', colspan: 2 }, 'Puntuación total'), pieTotal)));
  $('vista-progreso').append(h('div', { class: 'tabla-envoltorio' }, tabla));

  // ───────────── Pantalla AJUSTES ─────────────

  const calculadoEl = h('dd'); const ajusteEl = h('dd'); const totalEl = h('dd');
  const campoTotal = h('input', { class: 'campo', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: 9, 'aria-label': 'Total deseado', placeholder: '0' });
  const botonQuitarAjuste = h('button', { class: 'boton boton--sec', type: 'button', onclick: () => { commit(quitarAjuste(estado)); aviso_('Ajuste quitado: el total vuelve a ser el calculado.'); } }, 'Quitar ajuste');
  const aplicarTotal = () => {
    const texto = campoTotal.value.trim();
    if (!/^[0-9]{1,9}$/.test(texto)) { aviso_('Escribe un número entero, sin signos ni decimales.'); return; }
    const r = fijarTotal(botones, estado, Number(texto));
    if (!r.ok) { aviso_(r.motivo); return; }
    commit(r.estado);
    campoTotal.value = '';
    aviso_(`Total fijado en ${conUnidad(totalFinal(botones, estado))} (ajuste ${conSignoUnidad(estado.ajuste)}).`);
  };
  campoTotal.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarTotal(); } });

  const seccionTotal = h('section', { class: 'seccion', 'aria-labelledby': 'aj-total' },
    h('h2', { id: 'aj-total' }, 'Puntuación total'),
    h('dl', {}, h('dt', {}, 'Calculado con los contadores'), calculadoEl, h('dt', {}, 'Ajuste manual'), ajusteEl, h('dt', {}, 'Total'), totalEl),
    h('p', {}, 'Escribe el total que quieres y se guarda como un ajuste sobre lo calculado. Los contadores no cambian.'),
    h('div', { class: 'fila' }, campoTotal, h('button', { class: 'boton', type: 'button', onclick: aplicarTotal }, 'Aplicar total'), botonQuitarAjuste));

  const filasObjetivo = botones.map((b) => {
    const campo = h('input', { class: 'campo', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: 6, 'aria-label': `Objetivo de ${b.nombre}` });
    const guardarObjetivo = () => {
      const texto = campo.value.trim();
      const valor = /^[0-9]{1,6}$/.test(texto) ? Number(texto) : NaN;
      const nuevo = fijarObjetivo(estado, b.id, valor);
      if (!nuevo) { aviso_(`El objetivo debe ser un entero entre 1 y ${numero(MAX_CANTIDAD)}.`); campo.value = String(objetivoDe(b, estado)); return; }
      if (nuevo.objetivos[b.id] !== objetivoDe(b, estado)) { commit(nuevo, { animarTotal: false }); aviso_(`Objetivo de ${b.nombre}: ${numero(valor)}.`); }
    };
    campo.addEventListener('change', guardarObjetivo);
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); campo.blur(); } });
    refs.objetivos.set(b.id, campo);
    return h('div', { class: 'fila fila--objetivo', estilo: { '--c': b.color } },
      h('label', {}, h('span', { class: 'celda-nombre' }, h('span', { class: 'punto' }), b.nombre), campo));
  });
  // La etiqueta envuelve el campo: pulsar el nombre enfoca el número.
  const seccionObjetivos = h('section', { class: 'seccion', 'aria-labelledby': 'aj-obj' },
    h('h2', { id: 'aj-obj' }, 'Objetivos'),
    h('p', {}, 'Cuántas unidades quieres conseguir en cada botón. Se guarda al salir del campo.'),
    filasObjetivo,
    h('div', { class: 'fila' }, h('button', { class: 'boton boton--sec', type: 'button', onclick: () => { commit(restablecerObjetivos(estado), { animarTotal: false }); aviso_('Objetivos restablecidos a los iniciales.'); } }, 'Restablecer objetivos')));

  const casillaVibracion = h('input', { type: 'checkbox', id: 'pref-vibracion', onchange: (e) => commit(fijarPreferencia(estado, 'vibracion', e.target.checked), { animarTotal: false }) });
  const casillaAnimaciones = h('input', { type: 'checkbox', id: 'pref-animaciones', onchange: (e) => commit(fijarPreferencia(estado, 'animaciones', e.target.checked), { animarTotal: false }) });
  const notaVibracion = h('p', { class: 'nota', hidden: entorno.vibracion }, 'Este dispositivo o navegador no permite vibrar desde una web (por ejemplo, Safari en iPhone y iPad).');
  const notaMovimiento = h('p', { class: 'nota', hidden: true }, 'Tu dispositivo pide menos movimiento, así que las animaciones grandes están desactivadas y solo verás el mensaje.');
  casillaVibracion.disabled = !entorno.vibracion;
  const seccionPrefs = h('section', { class: 'seccion', 'aria-labelledby': 'aj-pref' },
    h('h2', { id: 'aj-pref' }, 'Preferencias'),
    h('label', { class: 'interruptor', for: 'pref-vibracion' }, casillaVibracion, 'Vibración'),
    notaVibracion,
    h('label', { class: 'interruptor', for: 'pref-animaciones' }, casillaAnimaciones, 'Animaciones de celebración'),
    notaMovimiento);

  // Copia de seguridad: texto que se copia o se pega (funciona igual en cualquier navegador, también instalada).
  const caja = h('textarea', { class: 'caja', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Datos de la copia de seguridad', placeholder: 'Aquí aparece la copia al exportar. Para importar, pega aquí una copia.' });
  const selectorArchivo = h('input', { type: 'file', accept: '.json,application/json', class: 'visualmente-oculto', id: 'archivo-copia', tabindex: -1 });
  const exportar = () => { caja.value = serializar(estado, true); caja.focus(); caja.select(); aviso_('Copia generada. Cópiala o descárgala y guárdala en un sitio seguro.'); };
  const copiar = async () => {
    if (!caja.value) exportar();
    try { await navigator.clipboard.writeText(caja.value); aviso_('Copia copiada al portapapeles.'); }
    catch { caja.select(); try { document.execCommand('copy'); aviso_('Copia copiada.'); } catch { aviso_('Selecciona el texto y cópialo a mano.'); } }
  };
  const descargar = () => {
    if (!caja.value) exportar();
    const enlace = h('a', { href: URL.createObjectURL(new Blob([caja.value], { type: 'application/json' })), download: `${eslugan(app.nombre)}-copia-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(enlace); enlace.click(); enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
  };
  const importar = async () => {
    const r = interpretar(caja.value.trim());
    if (r.tipo === 'invalido') { aviso_('Eso no es una copia válida de esta app.'); return; }
    if (r.tipo === 'versionFutura') { aviso_('Esa copia es de una versión más nueva de la app: actualiza antes de importarla.'); return; }
    if (!(await confirmar({ titulo: 'Importar copia', mensaje: 'Se sustituirán TODOS los datos actuales por los de la copia. Esto no se puede deshacer.', aceptar: 'Importar' }))) return;
    commit(r.estado);
    caja.value = '';
    aviso_(r.descartados > 0 ? `Copia importada. Se ignoraron ${r.descartados} valores no válidos.` : 'Copia importada.');
  };
  selectorArchivo.addEventListener('change', async () => {
    const archivo = selectorArchivo.files[0];
    selectorArchivo.value = '';
    if (!archivo) return;
    if (archivo.size > MAX_TEXTO_IMPORTADO) { aviso_('El archivo es demasiado grande para ser una copia de esta app.'); return; }
    caja.value = await archivo.text();
    aviso_('Archivo cargado. Pulsa «Importar» para aplicarlo.');
  });
  const seccionCopia = h('section', { class: 'seccion', 'aria-labelledby': 'aj-copia' },
    h('h2', { id: 'aj-copia' }, 'Copia de seguridad'),
    h('p', {}, 'Tus datos solo están en este dispositivo. Si borras los datos del navegador o desinstalas la app, se pierden. Guarda una copia de vez en cuando.'),
    caja,
    h('div', { class: 'fila' },
      h('button', { class: 'boton', type: 'button', onclick: exportar }, 'Exportar'),
      h('button', { class: 'boton boton--sec', type: 'button', onclick: copiar }, 'Copiar'),
      h('button', { class: 'boton boton--sec', type: 'button', onclick: descargar }, 'Descargar')),
    h('div', { class: 'fila' },
      h('button', { class: 'boton boton--sec', type: 'button', onclick: () => selectorArchivo.click() }, 'Cargar archivo…'),
      h('button', { class: 'boton', type: 'button', onclick: importar }, 'Importar')),
    selectorArchivo);

  const seccionDatos = h('section', { class: 'seccion', 'aria-labelledby': 'aj-datos' },
    h('h2', { id: 'aj-datos' }, 'Empezar de nuevo'),
    h('p', {}, 'Pone todos los contadores y el ajuste a cero. Los objetivos y las preferencias se conservan.'),
    h('button', {
      class: 'boton boton--peligro', type: 'button',
      onclick: async () => {
        if (!(await confirmar({ titulo: 'Reiniciar contadores', mensaje: 'Todos los contadores y el ajuste volverán a 0. Esto no se puede deshacer. Antes puedes exportar una copia.', aceptar: 'Reiniciar' }))) return;
        commit(reiniciarContadores(estado));
        aviso_('Contadores reiniciados.');
      },
    }, 'Reiniciar contadores'));

  let instalador = null;
  const botonInstalar = h('button', { class: 'boton', type: 'button', hidden: true, onclick: async () => { if (!instalador) return; instalador.prompt(); await instalador.userChoice.catch(() => {}); instalador = null; botonInstalar.hidden = true; } }, 'Instalar en este dispositivo');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); instalador = e; botonInstalar.hidden = false; });
  window.addEventListener('appinstalled', () => { instalador = null; botonInstalar.hidden = true; });
  const seccionAcerca = h('section', { class: 'seccion', 'aria-labelledby': 'aj-acerca' },
    h('h2', { id: 'aj-acerca' }, 'Acerca de'),
    h('p', {}, `${app.nombre} · versión ${app.version}. Funciona sin conexión una vez cargada.`),
    entorno.esIOS && !entorno.instalada ? h('p', {}, 'En iPhone: Safari → Compartir → «Añadir a pantalla de inicio».') : null,
    botonInstalar);

  $('vista-ajustes').append(seccionTotal, seccionObjetivos, seccionPrefs, seccionCopia, seccionDatos, seccionAcerca);

  // ───────────── Refrescar valores ─────────────

  /** Escribe el total en el número grande y en la cabecera. */
  function escribirTotal(valor) {
    totalNum.textContent = numero(valor);
    cabeceraChip.textContent = conUnidad(valor);
  }

  function animarNumero(hasta, conAnimacion) {
    cancelAnimationFrame(animacionNumero);
    const desde = mostrado;
    // El tamaño de la cifra se decide por lo que se VERÁ al final (con puntos de millar): la más larga sigue cabiendo
    // y el tamaño no salta durante la animación. Cuanto más corta, más grande.
    const largo = numero(hasta).length;
    totalNum.dataset.largo = String(largo <= 5 ? 5 : largo === 6 ? 6 : largo <= 8 ? 8 : largo === 9 ? 9 : 11);
    if (!conAnimacion || desde === hasta) { mostrado = hasta; escribirTotal(hasta); return; }
    if (hasta > desde) {                    // al subir, la cifra «late»
      totalNum.classList.remove('total__num--sube');
      void totalNum.offsetWidth;
      totalNum.classList.add('total__num--sube');
    }
    const inicio = performance.now();
    const paso = (ahora) => {
      const f = Math.min(1, (ahora - inicio) / 600);
      mostrado = Math.round(desde + (hasta - desde) * (1 - (1 - f) ** 3));
      escribirTotal(mostrado);
      if (f < 1) animacionNumero = requestAnimationFrame(paso);
    };
    animacionNumero = requestAnimationFrame(paso);
  }

  /**
   * ¿Se ve ahora mismo la cifra grande del total? Se mide la CIFRA, no el panel: si la cifra queda tapada por la
   * cabecera aunque la parte de abajo del panel asome, no hay ningún total a la vista.
   */
  function cifraVisible() {
    if (vistas.contar.hidden) return false;
    const r = totalNum.getBoundingClientRect();
    const bajoCabecera = document.querySelector('.cabecera').getBoundingClientRect().bottom;
    // Visible = la cifra entera queda por debajo de la cabecera. En cuanto empieza a taparse, entra el total fijo
    // (una regla sin zona gris: antes, con medio número tapado, no se veía ningún total).
    return r.width > 0 && r.top >= bajoCabecera - 2 && r.top <= window.innerHeight - 70;
  }

  /** El total fijo de la cabecera solo se muestra cuando la cifra grande no se ve (otra pestaña o ya se fue por arriba). */
  function actualizarCabecera() {
    cabeceraChip.hidden = cifraVisible();
  }

  function refrescar({ animarTotal = false } = {}) {
    const filas = progreso(botones, estado, hitos);
    const total = totalFinal(botones, estado);
    const calculado = totalCalculado(botones, estado);
    const global = Math.floor(progresoGlobal(botones, estado) * 100);

    animarNumero(total, animarTotal && animar());
    totalRelleno.style.setProperty('--p', `${global}%`);
    totalGlobal.textContent = `Progreso global ${global} %`;
    totalLeido.textContent = `Puntuación total: ${conUnidad(total)}. Progreso global: ${global} por ciento.`;
    totalDetalle.hidden = estado.ajuste === 0;
    totalDetalle.textContent = `Calculado ${conUnidad(calculado)} · ajuste manual ${conSignoUnidad(estado.ajuste)}`;

    for (const f of filas) {
      const t = refs.tarjetas.get(f.id);
      pintarMedalla(f.id, f.medalla);
      t.cantidad.textContent = `${numero(f.cantidad)} / ${numero(f.objetivo)}`;
      t.relleno.style.setProperty('--p', `${f.porcentaje}%`);
      t.barra.setAttribute('aria-valuenow', String(f.porcentaje));
      t.insignia.hidden = !f.completado;
      t.raiz.classList.toggle('tarjeta--completa', f.completado);

      const r = refs.tabla.get(f.id);
      r.hay.textContent = numero(f.cantidad);
      r.objetivo.textContent = numero(f.objetivo);
      r.pct.textContent = `${f.porcentaje} %`;
      r.relleno.style.setProperty('--p', `${f.porcentaje}%`);
      r.barra.setAttribute('aria-valuenow', String(f.porcentaje));
      r.marca.hidden = !f.completado;
      const campo = refs.objetivos.get(f.id);
      if (document.activeElement !== campo) campo.value = String(f.objetivo);
    }
    pieGlobal.textContent = `${global} %`;
    pieTotal.textContent = conUnidad(total);
    calculadoEl.textContent = conUnidad(calculado);
    ajusteEl.textContent = conSignoUnidad(estado.ajuste);
    totalEl.textContent = conUnidad(total);
    botonQuitarAjuste.disabled = estado.ajuste === 0;
    casillaVibracion.checked = estado.preferencias.vibracion && entorno.vibracion;
    casillaAnimaciones.checked = estado.preferencias.animaciones;
    notaMovimiento.hidden = !entorno.reducirMovimiento();
  }

  // ───────────── Pestañas ─────────────

  const vistas = { contar: $('vista-contar'), progreso: $('vista-progreso'), ajustes: $('vista-ajustes') };
  function mostrarVista(nombre) {
    for (const [n, el] of Object.entries(vistas)) el.hidden = n !== nombre;
    document.querySelectorAll('.pestana').forEach((b) => {
      if (b.dataset.vista === nombre) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    vistas[nombre].focus({ preventScroll: true });
    actualizarCabecera();
  }
  document.querySelectorAll('.pestana').forEach((b) => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));

  let esperandoMarco = false;
  window.addEventListener('scroll', () => {
    if (esperandoMarco) return;
    esperandoMarco = true;
    requestAnimationFrame(() => { esperandoMarco = false; actualizarCabecera(); });
  }, { passive: true });

  // Si otra pestaña o ventana de la app cambia los datos, se recargan aquí.
  window.addEventListener('storage', (e) => {
    if (e.key !== CLAVE && e.key !== null) return;
    const r = almacen.cargar();
    if (almacen.soloLectura) { mostrarIncompatible(); return; }
    estado = r.estado;
    refrescar({ animarTotal: false });
  });

  // ───────────── Arranque ─────────────

  for (const b of botones) pintarSelector(b.id);
  refrescar({ animarTotal: false });
  actualizarCabecera();
  pintarAvisoGuardado(entorno.almacenamientoDisponible ? { ok: true } : { ok: false, motivo: 'sinAlmacenamiento' });
  if (aviso === 'ilegible') aviso_('Los datos guardados no se pudieron leer. Se apartó una copia y se empezó de cero.');
  else if (aviso === 'descartados') aviso_(`Se ignoraron ${descartados} valores no válidos de los datos guardados.`);
}

// ───────────── Utilidades del navegador ─────────────

function recordar(clave, valor) { try { localStorage.setItem(`objetivo1mk:${clave}`, valor); } catch { /* sin almacenamiento */ } }
function recordado(clave) { try { return localStorage.getItem(`objetivo1mk:${clave}`); } catch { return null; } }
