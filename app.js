// app.js — Punto de entrada: comprueba la configuración, prepara el almacenamiento y arranca la interfaz.

import { APP, BOTONES, HITOS } from './config.js';
import { validarConfig } from './logica.js';
import { crearAlmacen } from './estado.js';
import { EFECTOS, crearReproductor } from './efectos.js';
import { iniciar } from './interfaz.js';

function mostrarError(lista) {
  const contenedor = document.getElementById('aplicacion');
  contenedor.textContent = '';
  const caja = document.createElement('section');
  caja.className = 'incompatible';
  const titulo = document.createElement('h1');
  titulo.textContent = 'Error en config.js';
  const ul = document.createElement('ul');
  for (const e of lista) { const li = document.createElement('li'); li.textContent = e; ul.append(li); }
  caja.append(titulo, ul);
  contenedor.append(caja);
}

// El nombre de la app sale de config.js (index.html y manifest.webmanifest llevan el mismo, para la primera pantalla y la instalación).
document.title = APP.nombre;
const titulo = document.querySelector('.cabecera__titulo');
if (titulo) titulo.textContent = APP.nombre;

const errores = validarConfig(BOTONES, HITOS, Object.keys(EFECTOS));
if (errores.length > 0) {
  mostrarError(errores);
} else {
  // Safari puede lanzar una excepción solo por mirar localStorage (modo privado, datos bloqueados).
  let almacenamiento = null;
  try {
    almacenamiento = window.localStorage;
    almacenamiento.getItem('objetivo1mk:prueba');
  } catch {
    almacenamiento = null;
  }

  const consultaMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  const entorno = {
    esIOS: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    instalada: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    vibracion: typeof navigator.vibrate === 'function',
    reducirMovimiento: () => consultaMovimiento.matches,
    almacenamientoDisponible: almacenamiento !== null,
  };

  iniciar({
    botones: BOTONES,
    hitos: HITOS,
    app: APP,
    almacen: crearAlmacen(almacenamiento),
    reproductor: crearReproductor({ canvas: document.getElementById('efectos'), cartel: document.getElementById('cartel') }),
    entorno,
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* sin modo sin conexión */ }); });
  }
}
