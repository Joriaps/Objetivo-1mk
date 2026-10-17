// config.js — LA PLANTILLA. Aquí se cambia lo que la app muestra, sin tocar nada más.
//
// Añadir un botón:      una línea más en BOTONES.
//   id        letras, números, guiones (máx. 32). NO lo cambies después: los datos guardados se unen por id.
//   nombre    lo que se ve.
//   color     como #FF5C8A.
//   objetivo  cuántas unidades se quieren conseguir (se puede cambiar luego desde Ajustes).
//   puntos    cuánto suma cada unidad a la puntuación total (aquí: el precio en euros).
// Quitar un botón:      bórralo de aquí; sus datos guardados se conservan pero ya no se ven ni cuentan.
// Añadir una animación: ver efectos.js, y asígnala a un hito aquí abajo.

export const APP = {
  nombre: 'Objetivo 1 Mk',
  version: '1.3.1',
  // Se escribe detrás de la puntuación total. Déjalo en '' si prefieres puntos sin unidad.
  unidad: '€',
  // Ajustes → «Ver las animaciones»: reproduce cada celebración sobre la primera tarjeta, sin cambiar datos.
  // Lo cambian solos PAQUETE-CON-PREVISUALIZACION.cmd y PAQUETE-SIN-PREVISUALIZACION.cmd; no hace falta tocarlo a mano.
  vistaPrevia: false,
};

// Precio por unidad (puntos) y número de ventas/socios que se quieren conseguir (objetivo).
// «Comunidad» es una suscripción: 197 € al año por socio.
export const BOTONES = [
  { id: 'comunidad',              nombre: 'Comunidad',                 color: '#FF5C8A', objetivo: 508,  puntos: 197 },
  { id: 'ebooks',                 nombre: 'Ebooks',                    color: '#FFD166', objetivo: 5556, puntos: 18 },
  { id: 'workshop',               nombre: 'Workshop',                  color: '#4CC9F0', objetivo: 3704, puntos: 27 },
  { id: 'talleres-grupales',      nombre: 'Talleres grupales',         color: '#06D6A0', objetivo: 400,  puntos: 500 },
  { id: 'formacio-empreses',      nombre: 'Formació a empreses',       color: '#7C6CFF', objetivo: 250,  puntos: 1200 },
  { id: 'talleres-presenciales',  nombre: 'Talleres presenciales',     color: '#FF9F43', objetivo: 1000, puntos: 100 },
  { id: 'formacion-profesionales', nombre: 'Formación a profesionales', color: '#C77DFF', objetivo: 201,  puntos: 997 },
];

// Celebraciones: al cruzar este PORCENTAJE del objetivo de un botón. Todas salen de la TARJETA que lo ha conseguido.
//   efecto     confeti | fuegos | destello | medalla | monedas | monedasPocas | cometa | estrellas | logro   (ver efectos.js)
//   opciones   destello: { intensidad: 1..3 }    medalla: { metal: 'bronce' | 'plata' | 'oro' }
//              Los hitos con `metal` también dejan una medalla fija en la esquina de la tarjeta.
//   exclusivo  true = cancela las demás animaciones en marcha (la final manda).
// Si se cruzan varios hitos de una vez (por ejemplo, sumar 300 de golpe), solo se celebra el mayor.
// Solo las tres medallas: el resto de sumas se celebra con una animación al azar (ver SUELTAS).
export const HITOS = [
  { porcentaje: 30,  efecto: 'medalla',  opciones: { metal: 'bronce' }, titulo: '¡Medalla de bronce!' },
  { porcentaje: 60,  efecto: 'medalla',  opciones: { metal: 'plata' }, titulo: '¡Medalla de plata!' },
  { porcentaje: 100, efecto: 'logro',    opciones: { metal: 'oro' }, titulo: '¡Objetivo conseguido!', exclusivo: true },
];

// Cada vez que SUMAS con un botón (y no se cruza una medalla) sale una de estas al azar, sin repetir la anterior.
// Sin cartel de texto y como mucho dos a la vez, para que pulsar seguido no sature el móvil.
//   nombre   cómo se llama en Ajustes → «Ver las animaciones»      efecto / opciones   igual que en HITOS
// Añadir otra: una línea más. Quitar una: bórrala. (Los nombres de efecto disponibles están en efectos.js.)
export const SUELTAS = [
  { nombre: 'Destello',    efecto: 'destello', opciones: { intensidad: 1 } },
  { nombre: 'Monedas',     efecto: 'monedasPocas' },
  { nombre: 'Cometa',      efecto: 'cometa' },
  { nombre: 'Estrellas',   efecto: 'estrellas' },
  { nombre: 'Confeti',     efecto: 'confetiLigero' },
  { nombre: 'Fuegos',      efecto: 'fuegosUno' },
  { nombre: 'Fuegos grandes', efecto: 'fuegos' },
  { nombre: 'Confeti grande', efecto: 'confeti' },
  { nombre: 'Lluvia de monedas', efecto: 'monedas' },
  { nombre: 'Globos',      efecto: 'globos' },
  { nombre: 'Serpentinas', efecto: 'serpentinas' },
  { nombre: 'Ondas',       efecto: 'ondas' },
  { nombre: 'Rayos',       efecto: 'rayos' },
];
