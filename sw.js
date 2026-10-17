// sw.js — Modo sin conexión. Estrategia: RED PRIMERO. Si hay conexión se sirve siempre la versión nueva (así
// nadie se queda atascado con una versión vieja); la copia guardada solo se usa si no hay red o tarda demasiado.

const CACHE = 'objetivo1mk-v1';
const ARCHIVOS = [
  './', './index.html', './styles.css', './app.js', './config.js', './logica.js', './estado.js',
  './interfaz.js', './efectos.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
const ESPERA_RED_MS = 4000;

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function redPrimero(peticion) {
  const cache = await caches.open(CACHE);
  try {
    const respuesta = await Promise.race([
      fetch(peticion),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo agotado')), ESPERA_RED_MS)),
    ]);
    if (respuesta && respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch {
    const guardada = (await cache.match(peticion, { ignoreSearch: true }))
      || (peticion.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    return guardada || Response.error();
  }
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  if (new URL(peticion.url).origin !== self.location.origin) return;
  evento.respondWith(redPrimero(peticion));
});
