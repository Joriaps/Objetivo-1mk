// efectos.js — Las celebraciones, dibujadas en un <canvas> a pantalla completa.
//
// REGLA DE DISEÑO: cada animación sale de donde ocurre el logro. No existe «el centro de la pantalla»: en
// una lista de tarjetas ese punto no significa nada. Por eso cada animación recibe una ESCENA:
//   ancho, alto   tamaño de la pantalla (px CSS)
//   origen        { x, y, ancho, alto } rectángulo de la TARJETA que ha conseguido el hito
//   insignia      { x, y, r } donde queda la medalla fija de esa tarjeta (esquina superior derecha)
//   total         { x, y } centro de la cifra del total (o del total fijo de la cabecera)
//   color         color de esa tarjeta
//   unidad        '€' o ''      porcentaje   el del hito (para el texto de la medalla)
//   calidad       0.35 … 1  cuántas partículas dibujar; el reproductor la baja solo si el móvil va justo
//
// Cada animación es una función que dibuja a partir de UN solo número: el tiempo transcurrido `t` (segundos).
// Nada se mueve «por su cuenta»: todas las posiciones son fórmulas de `t`, así que es reproducible y no acumula
// estado entre fotogramas. Las unidades son píxeles CSS.
//
// RENDIMIENTO: miles de chispas a 60 fps solo caben si se dibujan AGRUPADAS: un único trazado por grupo de color
// (no un trazado por chispa) y mezcla aditiva para el brillo. Si añades una animación con muchas partículas, haz lo mismo.
//
// CÓMO AÑADIR UNA ANIMACIÓN NUEVA (lo único que hay que hacer):
//   1. Escribe `function crearMiEfecto(escena, opciones)` que prepare lo aleatorio y DEVUELVA `(ctx, t) => { ... }`.
//   2. Añádela a EFECTOS: { duracion: segundos, vibraciones: [{ t, ms }], crear: crearMiEfecto }.
//   3. Asígnala a un hito en config.js (campo `efecto`, y `opciones` si las usa).
//   Para juntar varias: `componer([{ nombre, desfase, opciones }, ...])` (así está hecho `logro`).

const COLORES = ['#FF5C8A', '#7C6CFF', '#FFD166', '#06D6A0', '#4CC9F0', '#FFFFFF'];
const BRILLANTES = ['#FF5C8A', '#7C6CFF', '#FFD166', '#06D6A0', '#4CC9F0', '#FF9F43', '#C77DFF'];
const ORO = '#FFD166';
const DOS_PI = Math.PI * 2;

const grados = (g) => (g * Math.PI) / 180;
const limitar = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));
const azar = (min, max) => min + Math.random() * (max - min);
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];
const mezcla = (a, b, u) => a + (b - a) * u;
const suave = (u) => { const v = limitar(u); return v * v * (3 - 2 * v); };
/** Cantidad de partículas según la calidad de la escena (nunca menos de 1). */
const cant = (n, escena) => Math.max(1, Math.round(n * (escena.calidad ?? 1)));
/** Opacidad para un `rgba(...)` en texto: 0…1 con 3 decimales, nunca en notación científica (1e-7), que Safari rechaza. */
const op = (x) => (Math.round(limitar(x) * 1000) / 1000).toFixed(3);

/** Rebote al aparecer: sube pasándose un poco de 1 y se asienta. `x` va de 0 a 1; a partir de 1 vale 1. */
export function popIn(x) {
  if (x >= 1) return 1;
  const u = limitar(x) - 1;
  return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
}

/** Cae y rebota varias veces hasta asentarse en 1. */
function rebote(x) {
  const u = limitar(x);
  const n = 7.5625;
  const d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) { const v = u - 1.5 / d; return n * v * v + 0.75; }
  if (u < 2.5 / d) { const v = u - 2.25 / d; return n * v * v + 0.9375; }
  const v = u - 2.625 / d;
  return n * v * v + 0.984375;
}

function rectRedondo(ctx, x, y, w, h, r) {
  const radio = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + w, y, x + w, y + h, radio);
  ctx.arcTo(x + w, y + h, x, y + h, radio);
  ctx.arcTo(x, y + h, x, y, radio);
  ctx.arcTo(x, y, x + w, y, radio);
  ctx.closePath();
}

/** Destello de cuatro puntas (✦). */
function chispa(ctx, x, y, r, giro) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const radio = i % 2 === 0 ? r : r * 0.3;
    const a = giro + (i * Math.PI) / 4;
    const px = x + Math.cos(a) * radio;
    const py = y + Math.sin(a) * radio;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** Punto del perímetro de la tarjeta (recorrido de 0 a 2·(ancho+alto)) y su dirección hacia fuera. */
function puntoPerimetro(o, s) {
  const { x, y, ancho: w, alto: h } = o;
  if (s < w) return { x: x + s, y, nx: 0, ny: -1 };
  if (s < w + h) return { x: x + w, y: y + (s - w), nx: 1, ny: 0 };
  if (s < 2 * w + h) return { x: x + w - (s - w - h), y: y + h, nx: 0, ny: 1 };
  return { x, y: y + h - (s - 2 * w - h), nx: -1, ny: 0 };
}

// ───────────────────────────── Destello (en la tarjeta) ─────────────────────────────

const CHISPAS_DESTELLO = [12, 22, 36];

/** Pulsos de luz en el borde de la tarjeta, un brillo que la cruza en diagonal y chispas que salen por el borde. */
function crearDestello(escena, { intensidad = 1 } = {}) {
  const { origen: o, color } = escena;
  const nivel = limitar(Math.round(intensidad), 1, 3);
  const paleta = [color, '#FFFFFF', ORO];
  const chispas = Array.from({ length: cant(CHISPAS_DESTELLO[nivel - 1], escena) }, () => {
    const p = puntoPerimetro(o, Math.random() * 2 * (o.ancho + o.alto));
    const ang = Math.atan2(p.ny, p.nx) + (Math.random() - 0.5) * 1.2;
    return {
      x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), vel: azar(40, 140),
      inicio: azar(0, 0.55), vida: azar(0.6, 1.0), tam: azar(5, 11) + nivel * 1.5, fase: Math.random() * DOS_PI,
      color: elegir(paleta),
    };
  });

  return (ctx, t) => {
    ctx.globalCompositeOperation = 'lighter';
    // Pulsos de luz que se expanden desde el borde (tantos como el nivel).
    ctx.strokeStyle = color;
    for (let k = 0; k < nivel + 1; k++) {
      const u = (t - k * 0.18) / 0.75;
      if (u <= 0 || u >= 1) continue;
      const e = 1 - (1 - u) * (1 - u);
      ctx.globalAlpha = 0.8 * (1 - u);
      ctx.lineWidth = 3 + 2 * (1 - u);
      rectRedondo(ctx, o.x - 2 - 20 * e, o.y - 2 - 20 * e, o.ancho + 4 + 40 * e, o.alto + 4 + 40 * e, 18 + 20 * e);
      ctx.stroke();
    }

    // Brillo diagonal que cruza la tarjeta (recortado a su forma).
    const us = (t - 0.1) / 0.7;
    if (us > 0 && us < 1) {
      ctx.save();
      rectRedondo(ctx, o.x, o.y, o.ancho, o.alto, 18);
      ctx.clip();
      ctx.translate(o.x - 50 + (o.ancho + 100) * suave(us), o.y + o.alto / 2);
      ctx.rotate(0.35);
      const g = ctx.createLinearGradient(-38, 0, 38, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(-38, -o.alto, 76, o.alto * 2);
      ctx.restore();
    }

    // Chispas que salen por el borde, titilan y se apagan.
    for (const c of chispas) {
      const s = t - c.inicio;
      if (s < 0 || s >= c.vida) continue;
      const k = s / c.vida;
      ctx.globalAlpha = limitar(Math.sin(Math.PI * k) * (0.65 + 0.35 * Math.sin(s * 22 + c.fase)));
      ctx.fillStyle = c.color;
      chispa(ctx, c.x + c.dx * c.vel * s, c.y + c.dy * c.vel * s - 18 * s, c.tam * (0.6 + 0.6 * Math.sin(Math.PI * k)), s * 2 + c.fase);
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Medalla ─────────────────────────────

const METAL = {
  bronce: { luz: '#F0B27A', medio: '#CD7F32', oscuro: '#7A4414', texto: '#5A300D' },
  plata: { luz: '#FFFFFF', medio: '#C4CBD3', oscuro: '#737E89', texto: '#4B5561' },
  oro: { luz: '#FFF0A6', medio: '#F4B400', oscuro: '#9A6A00', texto: '#6B4700' },
};

/** Dibuja una medalla de radio R en (x, y). `sx` la hace girar (1 = de frente), `brillo` (0..1) cruza un reflejo. */
function dibujarMedalla(ctx, x, y, R, sx, metal, porcentaje, { cintas = true, brillo = -1, halo = 0 } = {}) {
  const m = METAL[metal] || METAL.oro;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.05, sx), 1);

  if (halo > 0) {
    const g = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 2.1);
    g.addColorStop(0, `rgba(255,226,122,${op(0.5 * halo)})`);
    g.addColorStop(1, 'rgba(255,226,122,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R * 2.1, 0, DOS_PI); ctx.fill();
  }

  if (cintas) {
    for (const [lado, color] of [[-1, '#E5484D'], [1, '#3E63DD']]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(lado * R * 0.62, R * 0.4);
      ctx.lineTo(lado * R * 0.12, R * 0.4);
      ctx.lineTo(lado * R * 0.1, R * 1.75);
      ctx.lineTo(lado * R * 0.38, R * 1.45);
      ctx.lineTo(lado * R * 0.66, R * 1.75);
      ctx.closePath();
      ctx.fill();
    }
  }

  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  g.addColorStop(0, m.luz);
  g.addColorStop(0.55, m.medio);
  g.addColorStop(1, m.oscuro);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, DOS_PI); ctx.fill();
  ctx.lineWidth = Math.max(1, R * 0.09);
  ctx.strokeStyle = m.oscuro;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, DOS_PI); ctx.stroke();
  ctx.lineWidth = Math.max(1, R * 0.04);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, DOS_PI); ctx.stroke();

  ctx.fillStyle = m.texto;
  ctx.font = `800 ${Math.max(6, R * 0.5)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${porcentaje}%`, 0, R * 0.04);

  if (brillo >= 0 && brillo <= 1) {
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, DOS_PI); ctx.clip();
    ctx.rotate(0.6);
    const bx = -R * 1.6 + R * 3.2 * brillo;
    const reflejo = ctx.createLinearGradient(bx - R * 0.3, 0, bx + R * 0.3, 0);
    reflejo.addColorStop(0, 'rgba(255,255,255,0)');
    reflejo.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    reflejo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = reflejo;
    ctx.fillRect(bx - R * 0.3, -R * 2, R * 0.6, R * 4);
    ctx.restore();
  }
  ctx.restore();
}

const R_MEDALLA = 44;

/**
 * La medalla cae sobre la tarjeta girando, rebota, aterriza con un fogonazo y una onda, se asienta con un reflejo
 * y vuela, dejando una estela de cometa, a su sitio fijo en la esquina de la tarjeta (donde se queda como insignia).
 */
function crearMedalla(escena, { metal = 'oro' } = {}) {
  const { origen: o, insignia, porcentaje = 100 } = escena;
  const cx = o.x + o.ancho / 2;
  const cy = o.y + o.alto / 2;
  const meta = insignia || { x: o.x + o.ancho - 28, y: o.y, r: 14 };
  const m = METAL[metal] || METAL.oro;
  const nBrotes = cant(22, escena);
  const brotes = Array.from({ length: nBrotes }, (_, i) => ({ ang: (DOS_PI * i) / nBrotes + azar(-0.2, 0.2), vel: azar(100, 260), tam: azar(5, 10) }));
  const posicion = (t) => {                              // dónde está la medalla en el instante t (para la estela)
    if (t < 0.6) return { x: cx, y: cy - 230 + 230 * rebote(t / 0.6), R: R_MEDALLA };
    if (t < 1.8) return { x: cx, y: cy + Math.sin(t * 5) * 3, R: R_MEDALLA };
    const u = suave((t - 1.8) / 0.8);
    return { x: mezcla(cx, meta.x, u), y: mezcla(cy, meta.y, u) - 60 * Math.sin(Math.PI * u), R: mezcla(R_MEDALLA, meta.r, u) };
  };

  return (ctx, t) => {
    ctx.globalCompositeOperation = 'lighter';
    // Fogonazo y onda al aterrizar (centrados en la medalla, no en la pantalla).
    const s0 = t - 0.55;
    if (s0 > 0 && s0 < 0.32) {
      const k = s0 / 0.32;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120 + 120 * k);
      g.addColorStop(0, `rgba(255,244,200,${op(0.6 * (1 - k))})`);
      g.addColorStop(1, 'rgba(255,244,200,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, 120 + 120 * k, 0, DOS_PI); ctx.fill();
    }
    if (s0 > 0 && s0 < 0.5) {
      const q = s0 / 0.5;
      ctx.globalAlpha = 0.65 * (1 - q);
      ctx.strokeStyle = m.luz;
      ctx.lineWidth = 1 + 4 * (1 - q);
      ctx.beginPath(); ctx.arc(cx, cy, 30 + 110 * q, 0, DOS_PI); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Estela de cometa mientras vuela hacia la insignia.
    if (t > 1.85 && t < 2.62) {
      ctx.fillStyle = m.luz;
      for (let k = 1; k <= 7; k++) {
        const p = posicion(Math.max(1.8, t - k * 0.035));
        ctx.globalAlpha = 0.55 * (1 - k / 8);
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, p.R * 0.28 * (1 - k / 9)), 0, DOS_PI); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // La medalla, por fases.
    if (t < 0.6) {
      const u = t / 0.6;
      const spin = Math.PI * 4 * (1 - (1 - u) * (1 - u));
      dibujarMedalla(ctx, cx, cy - 230 + 230 * rebote(u), R_MEDALLA * (0.5 + 0.5 * limitar(u * 2)), Math.abs(Math.cos(spin)), metal, porcentaje);
    } else if (t < 1.8) {
      dibujarMedalla(ctx, cx, cy + Math.sin(t * 5) * 3, R_MEDALLA, 1, metal, porcentaje, { brillo: (t - 0.7) / 0.6, halo: 0.6 + 0.4 * Math.sin(t * 6) });
    } else if (t < 2.6) {
      const u = suave((t - 1.8) / 0.8);
      const p = posicion(t);
      dibujarMedalla(ctx, p.x, p.y, p.R, 1, metal, porcentaje, { cintas: u < 0.25, halo: 0.6 * (1 - u) });
    }

    // Chispas al aterrizar.
    const s = t - 0.55;
    if (s > 0 && s < 0.8) {
      const k = s / 0.8;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = ORO;
      ctx.globalAlpha = 1 - k;
      for (const b of brotes) chispa(ctx, cx + Math.cos(b.ang) * b.vel * s, cy + Math.sin(b.ang) * b.vel * s + 40 * s * s, b.tam * (1 - 0.5 * k), s * 6);
      ctx.globalAlpha = 1;
    }
  };
}

// ───────────────────────────── Monedas al total ─────────────────────────────

/** Moneda que gira sobre su canto. */
function dibujarMoneda(ctx, x, y, r, t, fase, unidad) {
  const sx = Math.max(0.18, Math.abs(Math.cos(t * 9 + fase)));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, 1);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#FFF0A6');
  g.addColorStop(0.6, '#F4B400');
  g.addColorStop(1, '#B47B00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, DOS_PI); ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.strokeStyle = '#9A6A00';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, DOS_PI); ctx.stroke();
  if (sx > 0.55 && unidad) {
    ctx.fillStyle = '#7A5200';
    ctx.font = `800 ${Math.max(6, r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unidad, 0, r * 0.05);
  }
  ctx.restore();
}

/** Lluvia de monedas que saltan de la tarjeta y vuelan al total, que «chispea» cada vez que llega una. */
function crearMonedas(escena, { cantidad = 30 } = {}) {
  const { origen: o, total, unidad = '€' } = escena;
  const px = o.x + o.ancho / 2;
  const py = o.y + o.alto / 2;
  const G = 560;
  const n = cant(cantidad, escena);
  const monedas = Array.from({ length: n }, (_, i) => {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const m = {
      x0: px + azar(-34, 34), y0: py, ang, vel: azar(260, 540),
      tB: 0.3 + i * (1.0 / n) + azar(0, 0.08), dur: azar(0.5, 0.75),
      fase: Math.random() * DOS_PI, lado: Math.random() < 0.5 ? -1 : 1,
    };
    m.pos = (t) => {
      const f = (1 - Math.exp(-3 * t)) / 3;
      return { x: m.x0 + Math.cos(m.ang) * m.vel * f, y: m.y0 + Math.sin(m.ang) * m.vel * f + 0.5 * G * t * t };
    };
    m.pB = m.pos(m.tB);
    return m;
  });

  return (ctx, t) => {
    for (const m of monedas) {
      if (t < m.tB) {
        const p = m.pos(t);
        ctx.globalAlpha = limitar(t / 0.08);
        dibujarMoneda(ctx, p.x, p.y, 13, t, m.fase, unidad);
      } else if (t < m.tB + m.dur) {
        const u = (t - m.tB) / m.dur;
        const e = u * u;
        ctx.globalAlpha = 1;
        dibujarMoneda(ctx, mezcla(m.pB.x, total.x, e) + m.lado * 38 * Math.sin(Math.PI * u), mezcla(m.pB.y, total.y, e), 13 * (1 - 0.45 * e), t, m.fase, unidad);
      }
    }
    // Chispazo en el total cada vez que llega una moneda.
    ctx.globalCompositeOperation = 'lighter';
    for (const m of monedas) {
      const q = (t - (m.tB + m.dur)) / 0.4;
      if (q <= 0 || q >= 1) continue;
      ctx.globalAlpha = 0.7 * (1 - q);
      ctx.strokeStyle = ORO;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(total.x, total.y, 8 + 36 * q, 0, DOS_PI); ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      chispa(ctx, total.x, total.y, 10 + 12 * (1 - q), q * 5);
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Confeti (tres oleadas desde los lados de la tarjeta) ─────────────────────────────

const ARRASTRE_CONFETI = 2.5;   // el aire frena la subida
const CAIDA_CONFETI = 260;      // px/s: velocidad de caída final (el confeti flota)
const DURACION_CONFETI = 3.7;

function crearConfeti(escena) {
  const { origen: o } = escena;
  const total = cant(240, escena);
  const trozos = Array.from({ length: total }, (_, i) => {
    const izquierda = i % 2 === 0;
    const forma = Math.random();
    return {
      ox: izquierda ? o.x + 14 : o.x + o.ancho - 14,
      oy: o.y + o.alto * 0.45,
      inicio: Math.floor((i / total) * 3) * 0.22,                                        // tres oleadas
      angulo: grados((izquierda ? -50 : -130) + (Math.random() - 0.5) * 56),             // cada lado lanza hacia fuera y arriba
      velocidad: azar(520, 1350),
      tamano: azar(7, 15),
      giro: (Math.random() - 0.5) * 900,
      fase: Math.random() * DOS_PI,
      color: elegir(COLORES),
      forma: forma < 0.6 ? 0 : forma < 0.85 ? 1 : 2,                                      // papel, círculo, serpentina
    };
  });
  return (ctx, t) => {
    const opacidad = limitar((DURACION_CONFETI - t) / 0.8);
    // Fogonazo de cada «cañón».
    if (t < 0.28) {
      const q = t / 0.28;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.55 * (1 - q);
      for (const x of [o.x + 14, o.x + o.ancho - 14]) { ctx.beginPath(); ctx.arc(x, o.y + o.alto * 0.45, 10 + 34 * q, 0, DOS_PI); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const c of trozos) {
      const s = t - c.inicio;
      if (s < 0) continue;
      const frenado = (1 - Math.exp(-ARRASTRE_CONFETI * s)) / ARRASTRE_CONFETI;
      const x = c.ox + Math.cos(c.angulo) * c.velocidad * frenado + Math.sin(s * 5 + c.fase) * 14 * Math.min(1, s);
      const y = c.oy + Math.sin(c.angulo) * c.velocidad * frenado + CAIDA_CONFETI * (s - frenado);
      const volteo = Math.max(0.12, Math.abs(Math.cos(s * 7 + c.fase)));   // gira sobre su eje: se ve de canto y de cara
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(grados(c.giro * s));
      ctx.globalAlpha = opacidad;
      ctx.fillStyle = c.color;
      ctx.strokeStyle = c.color;
      if (c.forma === 0) {
        ctx.fillRect(-c.tamano / 2, -c.tamano * 0.3 * volteo, c.tamano, c.tamano * 0.6 * volteo);
      } else if (c.forma === 1) {
        ctx.beginPath(); ctx.arc(0, 0, c.tamano * 0.38, 0, DOS_PI); ctx.fill();
      } else {
        const L = c.tamano * 2.4;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-L / 2, 0);
        ctx.quadraticCurveTo(0, volteo * L * 0.7 * Math.sin(s * 9 + c.fase), L / 2, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  };
}

// ───────────────────────────── Fuegos artificiales (una exhibición que despega de la tarjeta) ─────────────────────────────
//
// Cinco formas: peonía (dos anillos), sauce dorado (cola larga que cae), anillo, corazón y estrella. Cada cohete se
// dibuja con UN trazado por grupo de color (+ uno para las cabezas brillantes y otro para los destellos): con 18 cohetes
// el coste por fotograma son unas decenas de trazados, no miles.

const VUELO = 0.55;            // s que tarda el cohete en subir
const TIPOS_FUEGO = ['peonia', 'corazon', 'sauce', 'estrella', 'anillo', 'peonia', 'sauce', 'anillo', 'corazon', 'estrella'];

/** Velocidades iniciales de las chispas de cada forma, más la física que las hace «caer» a su manera. */
function formaFuego(tipo, escena) {
  const dir = (a, v) => ({ vx: Math.cos(a) * v, vy: Math.sin(a) * v });
  if (tipo === 'sauce') {
    const m = cant(58, escena);
    return { grav: 125, arr: 1.7, vida: 2.2, cola: 0.17, grosor: 2.2, dorado: true,
      chispas: Array.from({ length: m }, (_, j) => dir((DOS_PI * j) / m + azar(-0.08, 0.08), azar(250, 470))) };
  }
  if (tipo === 'anillo') {
    const m = cant(46, escena);
    const k = cant(14, escena);
    return { grav: 110, arr: 2.0, vida: 1.8, cola: 0.09, grosor: 2.6, dorado: false,
      chispas: [
        ...Array.from({ length: m }, (_, j) => dir((DOS_PI * j) / m, 430)),
        ...Array.from({ length: k }, (_, j) => dir((DOS_PI * j) / k + 0.2, 215)),
      ] };
  }
  if (tipo === 'corazon') {
    const m = cant(58, escena);
    return { grav: 55, arr: 2.0, vida: 2.0, cola: 0.08, grosor: 2.8, dorado: false, rosa: true,
      chispas: Array.from({ length: m }, (_, j) => {
        const a = (DOS_PI * j) / m;
        return { vx: 16 * Math.sin(a) ** 3 * 26, vy: -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * 26 };
      }) };
  }
  if (tipo === 'estrella') {
    const m = cant(60, escena);
    const vertices = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 === 0 ? 1 : 0.42;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
    return { grav: 50, arr: 2.0, vida: 2.0, cola: 0.08, grosor: 2.8, dorado: true,
      chispas: Array.from({ length: m }, (_, j) => {
        const d = (j / m) * 10;                       // recorre el contorno de la estrella
        const i = Math.floor(d);
        const u = d - i;
        const a = vertices[i % 10];
        const b = vertices[(i + 1) % 10];
        return { vx: mezcla(a.x, b.x, u) * 470, vy: mezcla(a.y, b.y, u) * 470 };
      }) };
  }
  const m = cant(48, escena);                          // peonía
  const k = cant(30, escena);
  return { grav: 170, arr: 2.2, vida: 1.7, cola: 0.09, grosor: 2.5, dorado: false,
    chispas: [
      ...Array.from({ length: m }, (_, j) => dir((DOS_PI * j) / m + azar(-0.06, 0.06), azar(470, 560))),
      ...Array.from({ length: k }, (_, j) => dir((DOS_PI * j) / k + azar(-0.1, 0.1), azar(260, 340))),
    ] };
}

function crearFuegos(escena, { cohetes: pedidos = 18, extension = 3.4 } = {}) {
  const { ancho, alto, origen: o } = escena;
  const total = Math.max(3, cant(pedidos, escena));
  const finales = Math.min(4, Math.floor(total / 3));                       // la salva final
  // Explotan en la parte alta de la pantalla; si la tarjeta está arriba, también por debajo de la cabecera.
  const techo = 70;
  const suelo = Math.max(260, Math.min(alto * 0.55, o.y + 40));

  const lista = Array.from({ length: total }, (_, i) => {
    const forma = formaFuego(TIPOS_FUEGO[i % TIPOS_FUEGO.length], escena);
    const base = elegir(BRILLANTES);
    const color = forma.rosa ? '#FF5C8A' : forma.dorado ? '#FFD166' : base;
    const enSalva = i >= total - finales;
    const inicio = enSalva ? extension + azar(0, 0.15) : (i / Math.max(1, total - finales - 1)) * extension * 0.9 + azar(0, 0.08);
    const grupos = [{ color, chispas: [], fase: Math.random() * DOS_PI }, { color: '#FFFFFF', chispas: [], fase: Math.random() * DOS_PI }];
    forma.chispas.forEach((ch, j) => grupos[j % 6 === 0 ? 1 : 0].chispas.push(ch));
    if (TIPOS_FUEGO[i % TIPOS_FUEGO.length] === 'anillo') {                   // el anillo interior, de otro color
      const interior = elegir(BRILLANTES.filter((c) => c !== color));
      grupos.push({ color: interior, chispas: grupos[0].chispas.splice(Math.max(0, grupos[0].chispas.length - cant(14, escena))), fase: 1 });
    }
    const todas = grupos.flatMap((g) => g.chispas);
    return {
      ...forma, color, inicio, grupos,
      sx: o.x + o.ancho * [0.22, 0.5, 0.78][i % 3], sy: o.y,
      ex: ancho * azar(0.12, 0.88), ey: azar(techo, suelo),
      destellos: Array.from({ length: 8 }, () => ({ ch: elegir(todas), ini: azar(0.5, forma.vida * 0.75), fase: Math.random() * DOS_PI })),
    };
  });

  return (ctx, t) => {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const c of lista) {
      const s0 = t - c.inicio;
      if (s0 < 0) continue;

      if (s0 < VUELO) {
        // Subida desde la tarjeta: arranca rápido y frena al llegar arriba, dejando una estela de chispitas.
        const en = (u) => { const v = limitar(u); const e = 1 - (1 - v) * (1 - v); return { x: mezcla(c.sx, c.ex, e), y: mezcla(c.sy, c.ey, e) }; };
        const u = s0 / VUELO;
        const a = en(u - 0.2);
        const b = en(u);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.fillStyle = c.color;
        ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, DOS_PI); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, DOS_PI);
        for (let k = 1; k <= 4; k++) { const p = en(u - k * 0.06); ctx.moveTo(p.x + 1.5, p.y + k * 3); ctx.arc(p.x + Math.sin(k * 7 + c.inicio * 9) * 4, p.y + k * 3, 1.5, 0, DOS_PI); }
        ctx.fill();
        continue;
      }

      const s = s0 - VUELO;
      if (s >= c.vida) continue;
      const vida = 1 - s / c.vida;
      const alfa = Math.pow(vida, 0.7);
      const sAntes = Math.max(0, s - c.cola);
      const pos = (ch, ss) => {
        const d = (1 - Math.exp(-c.arr * ss)) / c.arr;
        return { x: c.ex + ch.vx * d, y: c.ey + ch.vy * d + 0.5 * c.grav * ss * ss };
      };

      // Fogonazo de la explosión: un resplandor del color del cohete.
      if (s < 0.3) {
        const q = s / 0.3;
        const r = 90 + 170 * q;
        const g = ctx.createRadialGradient(c.ex, c.ey, 0, c.ex, c.ey, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.35, c.color + '88');
        g.addColorStop(1, c.color + '00');
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c.ex, c.ey, r, 0, DOS_PI); ctx.fill();
      }

      // Estelas: un solo trazado por grupo de color.
      ctx.lineWidth = c.grosor;
      for (const g of c.grupos) {
        if (!g.chispas.length) continue;
        ctx.beginPath();
        for (const ch of g.chispas) {
          const a = pos(ch, sAntes);
          const b = pos(ch, s);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.globalAlpha = limitar(alfa * (0.82 + 0.18 * Math.sin(s * 31 + g.fase)));
        ctx.strokeStyle = g.color;
        ctx.stroke();
      }
      // Cabezas brillantes (una de cada cuatro chispas), todas en un trazado.
      ctx.beginPath();
      let k = 0;
      for (const g of c.grupos) for (const ch of g.chispas) {
        if ((k++ & 3) !== 0) continue;
        const b = pos(ch, s);
        ctx.moveTo(b.x + 2, b.y);
        ctx.arc(b.x, b.y, 2, 0, DOS_PI);
      }
      ctx.globalAlpha = limitar(alfa);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      // Destellos que parpadean cuando la explosión ya se apaga.
      ctx.beginPath();
      for (const d of c.destellos) {
        const q = s - d.ini;
        if (q < 0 || q > 0.6 || Math.sin(q * 46 + d.fase) < 0.1) continue;
        const b = pos(d.ch, s);
        ctx.moveTo(b.x + 2.6, b.y);
        ctx.arc(b.x, b.y, 2.6, 0, DOS_PI);
      }
      ctx.globalAlpha = limitar(vida * 1.4);
      ctx.fillStyle = '#FFF2B0';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Cometa (de la tarjeta al total) ─────────────────────────────

/**
 * Una bola de luz con cola cruza en curva de la tarjeta a la cifra del total y estalla en chispas sobre ella:
 * se ve de dónde sale cada euro y adónde va.
 */
function crearCometa(escena) {
  const { origen: o, total } = escena;
  const p0 = { x: o.x + o.ancho / 2, y: o.y + o.alto * 0.3 };
  const lado = Math.random() < 0.5 ? -1 : 1;
  const c = { x: (p0.x + total.x) / 2 + lado * 130, y: Math.min(p0.y, total.y) - 50 };
  const en = (u) => { const v = 1 - u; return { x: v * v * p0.x + 2 * v * u * c.x + u * u * total.x, y: v * v * p0.y + 2 * v * u * c.y + u * u * total.y }; };
  const T0 = 0.2;                      // carga en la tarjeta
  const VUELO_COMETA = 0.85;           // viaje
  const llegada = T0 + VUELO_COMETA;
  const nChispas = cant(16, escena);
  const chispas = Array.from({ length: nChispas }, (_, i) => ({ ang: (DOS_PI * i) / nChispas + azar(-0.2, 0.2), vel: azar(70, 190), tam: azar(4, 9) }));

  return (ctx, t) => {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // Carga: un brillo que crece sobre la tarjeta antes de salir.
    if (t < T0) {
      const k = t / T0;
      const g = ctx.createRadialGradient(p0.x, p0.y, 0, p0.x, p0.y, 34);
      g.addColorStop(0, `rgba(255,244,200,${op(0.8 * k)})`);
      g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p0.x, p0.y, 34, 0, DOS_PI); ctx.fill();
    }
    // Vuelo: cabeza brillante y cola de puntos que se apagan.
    if (t >= T0 && t < llegada) {
      const u = suave((t - T0) / VUELO_COMETA);
      const cabeza = en(u);
      for (let k = 18; k >= 1; k--) {
        const p = en(suave(Math.max(0, (t - T0 - k * 0.018) / VUELO_COMETA)));
        ctx.globalAlpha = 0.5 * (1 - k / 19);
        ctx.fillStyle = k % 3 === 0 ? '#FFFFFF' : ORO;
        ctx.beginPath(); ctx.arc(p.x + Math.sin(k * 5 + t * 20) * 2, p.y + Math.cos(k * 4 + t * 20) * 2, Math.max(1.5, 8 * (1 - k / 19)), 0, DOS_PI); ctx.fill();
      }
      const g = ctx.createRadialGradient(cabeza.x, cabeza.y, 0, cabeza.x, cabeza.y, 30);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, 'rgba(255,209,102,0.7)');
      g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cabeza.x, cabeza.y, 30, 0, DOS_PI); ctx.fill();
    }
    // Llegada: fogonazo, anillo y chispas que salen de la cifra del total.
    const s = t - llegada;
    if (s > 0 && s < 0.9) {
      const k = s / 0.9;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillStyle = '#FFFFFF';
      chispa(ctx, total.x, total.y, 26 + 20 * (1 - k), k * 4);
      ctx.strokeStyle = ORO;
      ctx.lineWidth = 1 + 4 * (1 - k);
      ctx.beginPath(); ctx.arc(total.x, total.y, 12 + 60 * k, 0, DOS_PI); ctx.stroke();
      ctx.fillStyle = ORO;
      for (const b of chispas) chispa(ctx, total.x + Math.cos(b.ang) * b.vel * s, total.y + Math.sin(b.ang) * b.vel * s + 30 * s * s, b.tam * (1 - 0.6 * k), s * 7);
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Estrellas fugaces (abanico que sale de la tarjeta) ─────────────────────────────

function crearEstrellas(escena) {
  const { origen: o } = escena;
  const ox = o.x + o.ancho / 2;
  const oy = o.y + o.alto * 0.4;
  const n = cant(11, escena);
  const estrellas = Array.from({ length: n }, (_, i) => ({
    ang: grados(-90 + ((i / Math.max(1, n - 1)) - 0.5) * 140 + azar(-8, 8)),   // abanico hacia arriba, no un círculo
    vel: azar(560, 980), inicio: azar(0, 0.45), vida: azar(0.95, 1.4), tam: azar(8, 14),
    color: Math.random() < 0.4 ? '#FFFFFF' : elegir([ORO, '#FFF0A6', '#4CC9F0']), fase: Math.random() * DOS_PI,
  }));
  const pos = (e, s) => { const d = (1 - Math.exp(-2.1 * s)) / 2.1; return { x: ox + Math.cos(e.ang) * e.vel * d, y: oy + Math.sin(e.ang) * e.vel * d + 0.5 * 90 * s * s }; };
  return (ctx, t) => {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const e of estrellas) {
      const s = t - e.inicio;
      if (s < 0 || s >= e.vida) continue;
      const k = s / e.vida;
      const a = pos(e, Math.max(0, s - 0.16));
      const b = pos(e, s);
      const alfa = limitar(Math.sin(Math.PI * Math.min(1, k * 1.15)) * (0.8 + 0.2 * Math.sin(s * 30 + e.fase)));
      ctx.globalAlpha = alfa * 0.8;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3.5 * (1 - 0.5 * k);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = alfa;
      ctx.fillStyle = e.color;
      chispa(ctx, b.x, b.y, e.tam * (1 - 0.4 * k), s * 5 + e.fase);
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Globos (suben desde la tarjeta) ─────────────────────────────

function crearGlobos(escena) {
  const { origen: o } = escena;
  const n = cant(9, escena);
  const globos = Array.from({ length: n }, (_, i) => {
    const rx = azar(13, 18);
    return {
      x0: o.x + o.ancho * (0.08 + 0.84 * ((i + Math.random() * 0.6) / n)),     // repartidos a lo ancho de la tarjeta
      y0: o.y + o.alto * 0.5,
      rx, ry: rx * 1.25, vel: azar(150, 260), inicio: azar(0, 0.5), vida: azar(2.0, 2.5),
      color: elegir(BRILLANTES), fase: Math.random() * DOS_PI,
    };
  });
  return (ctx, t) => {
    ctx.lineCap = 'round';
    for (const g of globos) {
      const s = t - g.inicio;
      if (s < 0 || s >= g.vida) continue;
      const k = s / g.vida;
      const sc = popIn(s / 0.25);
      const x = g.x0 + Math.sin(s * 2.2 + g.fase) * 14;
      const y = g.y0 - g.vel * s;
      const alfa = k < 0.75 ? 1 : limitar((1 - k) / 0.25);
      const base = y + g.ry * sc;
      ctx.globalAlpha = alfa * 0.6;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + Math.sin(s * 5 + g.fase) * 8, base + 16, x + Math.sin(s * 3 + g.fase) * 4, base + 34); ctx.stroke();
      ctx.globalAlpha = alfa * 0.95;
      ctx.fillStyle = g.color;
      ctx.beginPath(); ctx.ellipse(x, y, g.rx * sc, g.ry * sc, 0, 0, DOS_PI); ctx.fill();
      ctx.globalAlpha = alfa * 0.45;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(x - g.rx * 0.35 * sc, y - g.ry * 0.4 * sc, g.rx * 0.2 * sc, g.ry * 0.28 * sc, -0.5, 0, DOS_PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Serpentinas (cintas que salen de los lados de la tarjeta) ─────────────────────────────

function crearSerpentinas(escena) {
  const { origen: o } = escena;
  const n = cant(14, escena);
  const cintas = Array.from({ length: n }, (_, i) => {
    const izquierda = i % 2 === 0;
    return {
      x0: izquierda ? o.x + 14 : o.x + o.ancho - 14, y0: o.y + o.alto * 0.45,
      ang: grados((izquierda ? -60 : -120) + azar(-22, 22)), vel: azar(520, 860), inicio: azar(0, 0.25), vida: azar(1.7, 2.3),
      color: elegir(BRILLANTES), fase: Math.random() * DOS_PI, onda: azar(7, 14),
    };
  });
  const pos = (c, s) => {
    const d = (1 - Math.exp(-2.4 * s)) / 2.4;
    return { x: c.x0 + Math.cos(c.ang) * c.vel * d + Math.sin(s * 11 + c.fase) * c.onda * Math.min(1, s * 3), y: c.y0 + Math.sin(c.ang) * c.vel * d + 0.5 * 520 * s * s };
  };
  return (ctx, t) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of cintas) {
      const s = t - c.inicio;
      if (s < 0 || s >= c.vida) continue;
      const k = s / c.vida;
      ctx.globalAlpha = k < 0.7 ? 0.95 : limitar((1 - k) / 0.3) * 0.95;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 4.5 * (1 - 0.4 * k);
      let p = pos(c, s);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      for (let j = 1; j <= 12; j++) { p = pos(c, Math.max(0, s - j * 0.028)); ctx.lineTo(p.x, p.y); }   // la cola: dónde estuvo la cinta hace un momento
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Ondas (anillos que se expanden desde la tarjeta) ─────────────────────────────

function crearOndas(escena) {
  const { origen: o, ancho, alto, color } = escena;
  const cx = o.x + o.ancho / 2;
  const cy = o.y + o.alto / 2;
  const R = Math.max(240, Math.min(Math.max(ancho, alto) * 0.7, 620));
  const anillos = cant(4, escena);
  const puntos = cant(16, escena);
  const giro = Math.random() * DOS_PI;
  const VIDA = 1.3;
  return (ctx, t) => {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < anillos; i++) {
      const s = t - i * 0.22;
      if (s < 0 || s >= VIDA) continue;
      const k = s / VIDA;
      const r = Math.max(1, R * (1 - Math.pow(1 - k, 3)));          // sale rápido y frena
      ctx.globalAlpha = limitar((1 - k) * 0.9);
      ctx.strokeStyle = i % 2 === 0 ? color : '#FFFFFF';
      ctx.lineWidth = 2 + 7 * (1 - k);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, DOS_PI); ctx.stroke();
      if (i === 0) {
        ctx.fillStyle = '#FFFFFF';
        for (let j = 0; j < puntos; j++) {
          const a = giro + (DOS_PI * j) / puntos;
          chispa(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1 + 5 * (1 - k), s * 4 + j);
        }
      }
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Rayos (un sol que gira detrás de la tarjeta) ─────────────────────────────

function crearRayos(escena) {
  const { origen: o } = escena;
  const cx = o.x + o.ancho / 2;
  const cy = o.y + o.alto / 2;
  const n = cant(14, escena);
  const R = 520;
  const giro = Math.random() * DOS_PI;
  return (ctx, t) => {
    const env = Math.sin(Math.PI * limitar(t / 1.8));                // sube y baja suave
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    ctx.rotate(giro + t * 0.6);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(255,226,122,${op(0.7 * env)})`);
    g.addColorStop(1, 'rgba(255,226,122,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    const medio = (DOS_PI / n) * 0.28 * (0.6 + 0.4 * env);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i * DOS_PI) / n;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - medio) * R, Math.sin(a - medio) * R);
      ctx.lineTo(Math.cos(a + medio) * R, Math.sin(a + medio) * R);
      ctx.closePath();
    }
    ctx.fill();
    const h = ctx.createRadialGradient(0, 0, 0, 0, 0, 90);
    h.addColorStop(0, `rgba(255,255,255,${op(0.8 * env)})`);
    h.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = h;
    ctx.beginPath(); ctx.arc(0, 0, 90, 0, DOS_PI); ctx.fill();
  };
}

// ───────────────────────────── Registro ─────────────────────────────

export const EFECTOS = {
  confeti: { duracion: DURACION_CONFETI, vibraciones: [{ t: 0, ms: 60 }, { t: 0.22, ms: 30 }, { t: 0.44, ms: 30 }], crear: crearConfeti },
  fuegos: {
    duracion: 6.6,
    vibraciones: Array.from({ length: 9 }, (_, i) => ({ t: 0.7 + i * 0.62, ms: 15 })),     // un golpecito por explosión
    crear: crearFuegos,
  },
  // La mini-exhibición que acompaña al logro final: menos cohetes y más seguidos.
  fuegosCorto: {
    duracion: 4.9,
    vibraciones: Array.from({ length: 5 }, (_, i) => ({ t: 0.8 + i * 0.55, ms: 15 })),
    crear: (escena, opciones) => crearFuegos(escena, { cohetes: 11, extension: 1.8, ...opciones }),
  },
  destello: { duracion: 1.5, vibraciones: [{ t: 0, ms: 12 }], crear: crearDestello },
  medalla: { duracion: 2.7, tInsignia: 2.6, vibraciones: [{ t: 0.45, ms: 35 }], crear: crearMedalla },
  monedas: { duracion: 2.6, vibraciones: [{ t: 0.9, ms: 10 }, { t: 1.3, ms: 10 }, { t: 1.7, ms: 10 }], crear: crearMonedas },
  // Una lluvia corta de monedas (10): el dinero empieza a fluir.
  monedasPocas: { duracion: 2.3, vibraciones: [{ t: 0.8, ms: 10 }, { t: 1.3, ms: 10 }], crear: (escena, opciones) => crearMonedas(escena, { cantidad: 10, ...opciones }) },
  cometa: { duracion: 2.1, vibraciones: [{ t: 0.2, ms: 12 }, { t: 1.05, ms: 25 }], crear: crearCometa },
  estrellas: { duracion: 2.2, vibraciones: [{ t: 0, ms: 25 }, { t: 0.4, ms: 12 }], crear: crearEstrellas },
  globos: { duracion: 3.1, vibraciones: [{ t: 0.1, ms: 12 }], crear: crearGlobos },
  serpentinas: { duracion: 2.6, vibraciones: [{ t: 0, ms: 20 }], crear: crearSerpentinas },
  ondas: { duracion: 2.0, vibraciones: [{ t: 0, ms: 15 }], crear: crearOndas },
  rayos: { duracion: 1.8, vibraciones: [{ t: 0.3, ms: 15 }], crear: crearRayos },
  // Versiones pequeñas para las que salen al azar en cada suma: tres cohetes y un puñado de confeti.
  fuegosUno: {
    duracion: 3.8,
    vibraciones: [{ t: 0.8, ms: 15 }, { t: 1.3, ms: 15 }],
    crear: (escena, opciones) => crearFuegos(escena, { cohetes: 3, extension: 0.6, ...opciones }),
  },
  confetiLigero: { duracion: DURACION_CONFETI, vibraciones: [{ t: 0, ms: 20 }], crear: (escena) => crearConfeti({ ...escena, calidad: (escena.calidad ?? 1) * 0.3 }) },
};

/** Junta varias animaciones en una: cada parte empieza tras su `desfase` (s) y usa sus `opciones`. */
export function componer(partes) {
  const duracion = Math.max(...partes.map((p) => p.desfase + EFECTOS[p.nombre].duracion));
  return {
    duracion,
    vibraciones: partes.flatMap((p) => EFECTOS[p.nombre].vibraciones.map((v) => ({ ...v, t: v.t + p.desfase }))),
    crear(escena, opciones = {}) {
      const hijos = partes.map((p) => ({ p, def: EFECTOS[p.nombre], dibujar: EFECTOS[p.nombre].crear(escena, { ...opciones, ...p.opciones }) }));
      return (ctx, t) => {
        for (const { p, def, dibujar } of hijos) {
          const local = t - p.desfase;
          if (local < 0 || local > def.duracion) continue;
          ctx.save();
          dibujar(ctx, local);
          ctx.restore();
        }
      };
    },
  };
}

// El logro final: destello fuerte + medalla de oro que cae sobre la tarjeta + confeti + monedas que vuelan al total
// + una exhibición de fuegos artificiales. El cartel se queda 3,4 s; el espectáculo sigue un poco más.
EFECTOS.logro = componer([
  { nombre: 'destello', desfase: 0, opciones: { intensidad: 3 } },
  { nombre: 'medalla', desfase: 0, opciones: { metal: 'oro' } },
  { nombre: 'confeti', desfase: 0.5 },
  { nombre: 'monedas', desfase: 0.9 },
  { nombre: 'fuegosCorto', desfase: 1.1 },
]);
EFECTOS.logro.duracionCartel = 3.4;
EFECTOS.logro.tInsignia = 2.6;       // la medalla llega a su sitio a los 2,6 s; el espectáculo sigue hasta los 5,8 s

// ───────────────────────────── Reproductor ─────────────────────────────

/**
 * Dibuja los efectos en un <canvas> a pantalla completa y muestra el cartel (título + subtítulo) junto a la tarjeta.
 * `reproducir` acepta varios a la vez; `exclusivo` cancela los demás.
 *
 * CALIDAD ADAPTATIVA: mide cuánto tarda cada fotograma. Si un móvil va justo (> 26 ms de media), las animaciones
 * siguientes usan menos partículas; si va sobrado, vuelven a subir. Un móvil potente nunca nota nada.
 */
export function crearReproductor({ canvas, cartel, efectos = EFECTOS }) {
  const ctx = canvas.getContext('2d');
  let activos = [];
  let marco = 0;
  let ancho = 0;
  let alto = 0;
  let temporizadorCartel = 0;
  let baseCartel = 'translate(-50%, -50%)';
  let calidad = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ? 0.7 : 1;
  let ultimoCuadro = 0;
  let sumaCuadros = 0;
  let numCuadros = 0;
  const tituloEl = cartel.querySelector('.cartel__titulo');
  const subtituloEl = cartel.querySelector('.cartel__subtitulo');

  function ajustar() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === ancho && h === alto && canvas.width === Math.round(w * dpr)) return;
    ancho = w;
    alto = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** El cartel va a caballo sobre el borde superior de la tarjeta, como una etiqueta: así nunca tapa la cifra del total. */
  function mostrarCartel(titulo, subtitulo, origen, color) {
    tituloEl.textContent = titulo;
    subtituloEl.textContent = subtitulo || '';
    cartel.style.setProperty('--c', color || '#FFFFFF');
    cartel.hidden = false;
    if (!origen) {
      cartel.style.left = '50%';
      cartel.style.top = '42%';
      cartel.style.transformOrigin = '50% 50%';
      baseCartel = 'translate(-50%, -50%)';
      return;
    }
    const mitad = cartel.offsetWidth / 2;
    cartel.style.left = `${limitar(origen.x + origen.ancho / 2, mitad + 8, Math.max(mitad + 8, ancho - mitad - 8))}px`;
    // Nunca fuera de la pantalla: aunque la tarjeta esté pegada al borde de abajo, el cartel se queda a la vista.
    cartel.style.top = `${limitar(origen.y, 80, Math.max(80, alto - 110))}px`;
    cartel.style.transformOrigin = '50% 50%';
    baseCartel = 'translate(-50%, -50%)';
  }

  function ocultarCartel() {
    cartel.hidden = true;
    cartel.style.removeProperty('transform');
    cartel.style.removeProperty('opacity');
  }

  function terminar(a) {
    if (a.cartel) { a.cartel = false; ocultarCartel(); }
    for (const clave of ['alInsignia', 'alTerminar']) {
      if (a[clave]) { const f = a[clave]; a[clave] = null; try { f(); } catch (e) { console.error(e); } }
    }
  }

  /** Ajusta la calidad con lo que tardaron los fotogramas de esta tanda de animaciones. */
  function evaluarFluidez() {
    if (numCuadros >= 20) {
      const media = sumaCuadros / numCuadros;
      if (media > 26) calidad = Math.max(0.35, calidad * 0.7);
      else if (media < 19 && calidad < 1) calidad = Math.min(1, calidad * 1.15);
    }
    sumaCuadros = 0;
    numCuadros = 0;
    ultimoCuadro = 0;
  }

  function cuadro(ahora) {
    if (ultimoCuadro) { const d = ahora - ultimoCuadro; if (d < 250) { sumaCuadros += d; numCuadros++; } }
    ultimoCuadro = ahora;
    ctx.clearRect(0, 0, ancho, alto);
    activos = activos.filter((a) => {
      // El reloj de arranque es el del PROPIO fotograma, no performance.now(): en Safari de iOS ambos relojes pueden
      // no coincidir, y la animación acababa (o no empezaba) sin dibujarse.
      if (a.inicio === null) a.inicio = ahora;
      const t = Math.max(0, (ahora - a.inicio) / 1000);
      if (t >= a.def.duracion) { terminar(a); return false; }
      try {
        while (a.vibraciones.length && a.vibraciones[0].t <= t) {
          const v = a.vibraciones.shift();
          if (a.vibrar) a.vibrar(v.ms);
        }
        ctx.save();
        a.dibujar(ctx, t);
        ctx.restore();
        if (a.alInsignia && t >= (a.def.tInsignia ?? Infinity)) { const f = a.alInsignia; a.alInsignia = null; f(); }   // la medalla ya llegó
        if (a.cartel) {
          const duracionCartel = a.def.duracionCartel ?? a.def.duracion;
          if (t >= duracionCartel) { a.cartel = false; ocultarCartel(); }
          else {
            const f = t / duracionCartel;
            cartel.style.transform = `${baseCartel} scale(${popIn(f / 0.10)})`;
            cartel.style.opacity = f < 0.78 ? '1' : String(limitar((1 - f) / 0.22));
          }
        }
      } catch (error) {
        console.error('Error dibujando la animación', error);
        if (a.alFallar) { try { a.alFallar(error); } catch (e) { console.error(e); } }
        terminar(a);
        return false;
      }
      return true;
    });
    if (activos.length) {
      marco = requestAnimationFrame(cuadro);
    } else {
      marco = 0;
      ctx.clearRect(0, 0, ancho, alto);
      evaluarFluidez();
    }
  }

  /**
   * @param nombre   clave de EFECTOS
   * @param opciones { titulo, subtitulo, animar (false = solo el cartel, sin movimiento), vibrar (fn|null), exclusivo,
   *                   escena ({ origen, insignia, total, color, unidad, porcentaje }), opciones (del hito),
   *                   alInsignia (cuando la medalla llega a su sitio), alTerminar (cuando acaba todo) }
   */
  function reproducir(nombre, { titulo, subtitulo, animar = true, vibrar = null, exclusivo = false, escena = {}, opciones = {}, alInsignia = null, alTerminar = null, alFallar = null } = {}) {
    const def = efectos[nombre];
    if (!def) { if (alInsignia) alInsignia(); if (alTerminar) alTerminar(); return; }
    clearTimeout(temporizadorCartel);
    ajustar();

    if (!animar) {
      // Sin movimiento (preferencia del usuario o del sistema): solo un cartel quieto unos segundos.
      for (const a of activos) terminar(a);
      activos = [];
      cancelAnimationFrame(marco);
      marco = 0;
      ctx.clearRect(0, 0, ancho, alto);
      if (titulo) {
        mostrarCartel(titulo, subtitulo, escena.origen, escena.color);
        cartel.style.transform = baseCartel;
        cartel.style.opacity = '1';
        temporizadorCartel = setTimeout(ocultarCartel, 2800);
      }
      if (alInsignia) alInsignia();
      if (alTerminar) alTerminar();
      return;
    }

    if (exclusivo) { for (const a of activos) terminar(a); activos = []; }
    if (titulo) for (const a of activos) a.cartel = false;     // el cartel es del último efecto lanzado (uno sin cartel no lo roba)
    if (titulo) mostrarCartel(titulo, subtitulo, escena.origen, escena.color);
    let dibujar;
    try {
      dibujar = def.crear({ ancho, alto, calidad, ...escena }, opciones);
    } catch (error) {
      // Un navegador raro no debe dejar el cartel colgado ni la insignia sin aparecer: se queda el mensaje quieto.
      console.error('No se pudo crear la animación', error);
      if (alFallar) { try { alFallar(error); } catch (e) { console.error(e); } }
      for (const f of [alInsignia, alTerminar]) if (f) f();
      temporizadorCartel = setTimeout(ocultarCartel, 2800);
      return;
    }
    activos.push({
      def,
      dibujar,
      inicio: null,        // se fija con la marca de tiempo del primer fotograma
      vibraciones: [...def.vibraciones].sort((a, b) => a.t - b.t),
      vibrar,
      cartel: Boolean(titulo),
      alInsignia,
      alTerminar,
      alFallar,
    });
    if (!marco) marco = requestAnimationFrame(cuadro);
  }

  window.addEventListener('resize', () => { if (!activos.length) ajustar(); });
  return { reproducir, get calidad() { return calidad; }, get activas() { return activos.length; } };
}
