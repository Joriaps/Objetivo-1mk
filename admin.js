// admin.js — Página de vista previa de las celebraciones (admin.html). No está enlazada desde la app: se abre escribiendo
// su dirección. NO guarda ni cambia ningún dato: usa una tarjeta y un total DE MUESTRA y la misma configuración
// (config.js) y las mismas animaciones (efectos.js) que la app, así que lo que se ve aquí es lo que saldrá allí.
//
// Ojo: «oculta» no es «protegida». Cualquiera que conozca la dirección puede abrirla; no hace nada peligroso
// (solo reproduce animaciones), pero tampoco hay contraseña.

import { APP, BOTONES, HITOS } from './config.js';
import { EFECTOS, crearReproductor } from './efectos.js';
import { colorTexto, formatearNumero, medallaDe, umbralDe } from './logica.js';

const $ = (id) => document.getElementById(id);
const numero = formatearNumero;
const unidad = APP.unidad || '';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

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

const reproductor = crearReproductor({ canvas: $('efectos'), cartel: $('cartel') });
let oferta = BOTONES[0];
let ocupado = false;
let ficha = 0;                                // cada celebración lleva su número: solo vale el aviso de la ÚLTIMA
let volando = false;                          // la medalla animada aún vuela: la insignia fija no se muestra

// ── Total y tarjeta de muestra (mismas clases que la app) ──
const totalNum = h('span', { class: 'total__num', id: 'total-num' }, '0');
const totalRelleno = h('div', { class: 'relleno' });
const panelTotal = h('section', { class: 'total', 'aria-label': 'Total de muestra' },
  h('div', { class: 'total__fila' }, h('h2', { class: 'total__etiqueta' }, 'Puntuación total (muestra)')),
  h('div', { class: 'total__cifra' }, totalNum, unidad ? h('span', { class: 'total__unidad' }, unidad) : null),
  h('div', { class: 'barra total__barra', 'aria-hidden': 'true' }, totalRelleno));

const nombreEl = h('span', { class: 'tarjeta__nombre-texto' });
const puntosEl = h('span', { class: 'puntos' });
const cantidadEl = h('span', { class: 'tarjeta__cantidad' });
const rellenoEl = h('div', { class: 'relleno' });
const medallaEl = h('span', { class: 'medalla medalla--oculta', 'aria-hidden': 'true' });
const guardarFalso = h('button', { class: 'boton boton--guardar', type: 'button', disabled: true, tabindex: -1 }, 'Sumar 1');
const tarjeta = h('article', { class: 'tarjeta', 'aria-label': 'Tarjeta de muestra' },
  h('div', { class: 'tarjeta__cabecera' }, h('h3', { class: 'tarjeta__nombre' }, h('span', { class: 'punto' }), nombreEl, puntosEl), cantidadEl),
  h('div', { class: 'barra', 'aria-hidden': 'true' }, rellenoEl),
  h('div', { class: 'controles', 'aria-hidden': 'true' },
    h('div', { class: 'selector' },
      h('button', { class: 'selector__boton', type: 'button', disabled: true, tabindex: -1 }, '−'),
      h('input', { class: 'selector__valor', type: 'text', value: '1', disabled: true, tabindex: -1 }),
      h('button', { class: 'selector__boton', type: 'button', disabled: true, tabindex: -1 }, '+')),
    h('div', { class: 'accion' }, guardarFalso)),
  medallaEl);

function pintarMuestra(porcentaje, { medalla = true } = {}) {
  const cantidad = porcentaje === 0 ? 0 : umbralDe(oferta.objetivo, porcentaje);
  tarjeta.style.setProperty('--c', oferta.color);
  tarjeta.style.setProperty('--c-texto', colorTexto(oferta.color));
  nombreEl.textContent = oferta.nombre;
  puntosEl.textContent = unidad ? `${numero(oferta.puntos)} ${unidad}/ud.` : `×${numero(oferta.puntos)} pts`;
  puntosEl.hidden = oferta.puntos === 1;
  cantidadEl.textContent = `${numero(cantidad)} / ${numero(oferta.objetivo)}`;
  rellenoEl.style.setProperty('--p', `${Math.min(100, Math.floor((cantidad / oferta.objetivo) * 100))}%`);
  totalNum.textContent = numero(cantidad * oferta.puntos);
  totalRelleno.style.setProperty('--p', `${Math.min(100, Math.floor((cantidad / oferta.objetivo) * 100))}%`);
  const largo = totalNum.textContent.length;
  totalNum.dataset.largo = String(largo <= 5 ? 5 : largo === 6 ? 6 : largo <= 8 ? 8 : largo === 9 ? 9 : 11);
  tarjeta.classList.toggle('tarjeta--completa', cantidad >= oferta.objetivo);
  if (medalla) pintarMedalla(medallaDe(cantidad, oferta.objetivo, HITOS));
}

function pintarMedalla(metal) {
  medallaEl.dataset.metal = metal || '';
  medallaEl.classList.toggle('medalla--oculta', !metal || volando);
}

const centro = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

function reproducir(hito) {
  window.scrollTo(0, 0);                       // total y tarjeta están arriba: así se ven completos

  const cantidad = umbralDe(oferta.objetivo, hito.porcentaje);
  const llevaMedalla = Boolean(hito.opciones && hito.opciones.metal);
  volando = llevaMedalla;                       // igual que en la app: mientras vuela, la insignia fija se oculta
  pintarMuestra(hito.porcentaje);
  const mia = ++ficha;
  const revelar = () => { if (mia !== ficha || !volando) return; volando = false; pintarMedalla(medallaDe(cantidad, oferta.objetivo, HITOS)); };
  const r = tarjeta.getBoundingClientRect();
  const m = centro(medallaEl);
  reproductor.reproducir(hito.efecto, {
    titulo: hito.titulo,
    subtitulo: `${oferta.nombre}: ${numero(cantidad)} / ${numero(oferta.objetivo)}`,
    animar: true,
    vibrar: typeof navigator.vibrate === 'function' ? (ms) => navigator.vibrate(ms) : null,
    exclusivo: Boolean(hito.exclusivo),
    escena: {
      origen: { x: r.left, y: r.top, ancho: r.width, alto: r.height },
      insignia: { x: m.x, y: m.y, r: 14 },
      total: centro(totalNum),
      color: oferta.color, unidad, porcentaje: hito.porcentaje,
    },
    opciones: hito.opciones,
    alInsignia: revelar,                          // la insignia aparece cuando la MEDALLA llega, no cuando acaba todo el espectáculo
    alTerminar: revelar,
  });
}

// ── Controles ──
const botonesHito = HITOS.map((hito) => h('button', {
  class: 'boton boton--sec boton--chico', type: 'button', title: `${hito.titulo} (${hito.efecto})`,
  onclick: () => { if (!ocupado) reproducir(hito); },
}, `${hito.porcentaje} %`));

const botonEscalera = h('button', {
  class: 'boton', type: 'button',
  onclick: async () => {
    if (ocupado) return;
    ocupado = true;
    botonEscalera.disabled = true;
    volando = false;
    pintarMuestra(0);
    for (const hito of HITOS) {
      reproducir(hito);
      await dormir(EFECTOS[hito.efecto].duracion * 1000 + 500);
    }
    ocupado = false;
    botonEscalera.disabled = false;
  },
}, 'Ver los 10 hitos seguidos');

const botonesOferta = BOTONES.map((b) => h('button', {
  class: 'boton boton--sec boton--chico', type: 'button', 'aria-label': b.nombre,
  onclick: () => { if (ocupado) return; oferta = b; volando = false; pintarMuestra(0); },
}, h('span', { class: 'punto', estilo: { '--c': b.color, display: 'inline-block' } }), ` ${b.nombre}`));

// Orden pensado para el móvil: el total y la tarjeta de muestra arriba (siempre a la vista, porque las animaciones
// salen de la tarjeta) y los botones justo debajo; el texto y las ofertas, al final.
$('admin').append(
  panelTotal,
  tarjeta,
  h('section', { class: 'seccion' },
    h('h2', {}, 'Hitos'),
    h('div', { class: 'rejilla-hitos' }, botonesHito),
    h('div', { class: 'fila' }, botonEscalera, h('button', { class: 'boton boton--sec', type: 'button', onclick: () => { if (!ocupado) { volando = false; pintarMuestra(0); } } }, 'Volver a 0 %'))),
  h('section', { class: 'seccion' },
    h('h2', {}, 'Oferta de muestra'),
    h('div', { class: 'rejilla-ofertas' }, botonesOferta)),
  h('section', { class: 'seccion' },
    h('p', {}, 'Vista previa de las celebraciones sobre una tarjeta de muestra. No guarda ni cambia ningún dato de la app. Misma configuración y mismas animaciones: lo que ves aquí es lo que saldrá allí.')));
pintarMuestra(0);
