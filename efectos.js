// efectos.js — Las celebraciones, dibujadas en un <canvas> a pantalla completa.
//
// REGLA DE DISEÑO: cada animación sale de donde ocurre el logro. No existe «el centro de la pantalla»: en
// una lista de tarjetas ese punto no significa nada. Por eso cada animación recibe una ESCENA:
//   ancho, alto   tamaño de la pantalla (px CSS)
//   origen        { x, y, ancho, alto } rectángulo de la TARJETA que ha conseguido el hito
//   insignia      { x, y, r } donde queda la medalla fija de esa tarjeta (esquina superior derecha)
//   total         { x, y } centro del panel de puntuación total (ya recortado a lo visible)
//   color         color de esa tarjeta
//   unidad        '€' o ''      porcentaje   el del hito (para el texto de la medalla)
//
// Cada animación es una función que dibuja a partir de UN solo número: el tiempo transcurrido `t` (segundos).
// Nada se mueve «por su cuenta»: todas las posiciones son fórmulas de `t`, así que es reproducible y no acumula
// estado entre fotogramas. Las unidades son píxeles CSS.
//
// CÓMO AÑADIR UNA ANIMACIÓN NUEVA (lo único que hay que hacer):
//   1. Escribe `function crearMiEfecto(escena, opciones)` que prepare lo aleatorio y DEVUELVA `(ctx, t) => { ... }`.
//   2. Añádela a EFECTOS: { duracion: segundos, vibraciones: [{ t, ms }], crear: crearMiEfecto }.
//   3. Asígnala a un hito en config.js (campo `efecto`, y `opciones` si las usa).
//   Para juntar varias: `componer([{ nombre, desfase, opciones }, ...])` (así está hecho `logro`).

const COLORES = ['#FF5C8A', '#7C6CFF', '#FFD166', '#06D6A0', '#4CC9F0', '#FFFFFF'];
const ORO = '#FFD166';
const DOS_PI = Math.PI * 2;

const grados = (g) => (g * Math.PI) / 180;
const limitar = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));
const azar = (min, max) => min + Math.random() * (max - min);
const mezcla = (a, b, u) => a + (b - a) * u;
const suave = (u) => { const v = limitar(u); return v * v * (3 - 2 * v); };

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

const CHISPAS_DESTELLO = [8, 14, 22];

/** Pulsos de luz en el borde de la tarjeta, un brillo que la cruza en diagonal y chispas que salen por el borde. */
function crearDestello({ origen: o, color }, { intensidad = 1 } = {}) {
  const nivel = limitar(Math.round(intensidad), 1, 3);
  const paleta = [color, '#FFFFFF', ORO];
  const chispas = Array.from({ length: CHISPAS_DESTELLO[nivel - 1] }, () => {
    const p = puntoPerimetro(o, Math.random() * 2 * (o.ancho + o.alto));
    const ang = Math.atan2(p.ny, p.nx) + (Math.random() - 0.5) * 1.2;
    return {
      x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), vel: azar(40, 120),
      inicio: azar(0, 0.55), vida: azar(0.6, 1.0), tam: azar(5, 11) + nivel, fase: Math.random() * DOS_PI,
      color: paleta[Math.floor(Math.random() * paleta.length)],
    };
  });

  return (ctx, t) => {
    // Dos pulsos de luz que se expanden desde el borde.
    ctx.strokeStyle = color;
    for (const t0 of [0, 0.22]) {
      const u = (t - t0) / 0.75;
      if (u <= 0 || u >= 1) continue;
      const e = 1 - (1 - u) * (1 - u);
      ctx.globalAlpha = 0.8 * (1 - u);
      ctx.lineWidth = 3 + 2 * (1 - u);
      rectRedondo(ctx, o.x - 2 - 18 * e, o.y - 2 - 18 * e, o.ancho + 4 + 36 * e, o.alto + 4 + 36 * e, 18 + 18 * e);
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
      const g = ctx.createLinearGradient(-34, 0, 34, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(-34, -o.alto, 68, o.alto * 2);
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
    g.addColorStop(0, `rgba(255,226,122,${0.45 * halo})`);
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
    reflejo.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    reflejo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = reflejo;
    ctx.fillRect(bx - R * 0.3, -R * 2, R * 0.6, R * 4);
    ctx.restore();
  }
  ctx.restore();
}

const R_MEDALLA = 44;

/**
 * La medalla cae sobre la tarjeta girando, rebota, se asienta con un reflejo y vuela a su sitio fijo en la esquina
 * de la tarjeta (donde se queda como insignia).
 */
function crearMedalla({ origen: o, insignia, porcentaje = 100 }, { metal = 'oro' } = {}) {
  const cx = o.x + o.ancho / 2;
  const cy = o.y + o.alto / 2;
  const meta = insignia || { x: o.x + o.ancho - 28, y: o.y, r: 14 };
  const brotes = Array.from({ length: 10 }, (_, i) => ({ ang: (DOS_PI * i) / 10 + azar(-0.2, 0.2), vel: azar(90, 190), tam: azar(5, 9) }));

  return (ctx, t) => {
    if (t < 0.6) {
      const u = t / 0.6;
      const spin = Math.PI * 4 * (1 - (1 - u) * (1 - u));
      const y = cy - 230 + 230 * rebote(u);
      dibujarMedalla(ctx, cx, y, R_MEDALLA * (0.5 + 0.5 * limitar(u * 2)), Math.abs(Math.cos(spin)), metal, porcentaje);
    } else if (t < 1.8) {
      const u = (t - 0.7) / 0.6;
      dibujarMedalla(ctx, cx, cy + Math.sin(t * 5) * 3, R_MEDALLA, 1, metal, porcentaje, { brillo: u, halo: 0.6 + 0.4 * Math.sin(t * 6) });
    } else if (t < 2.6) {
      const u = suave((t - 1.8) / 0.8);
      const x = mezcla(cx, meta.x, u);
      const y = mezcla(cy, meta.y, u) - 60 * Math.sin(Math.PI * u);
      dibujarMedalla(ctx, x, y, mezcla(R_MEDALLA, meta.r, u), 1, metal, porcentaje, { cintas: u < 0.25, halo: 0.6 * (1 - u) });
    }
    // Chispas al aterrizar.
    const s = t - 0.55;
    if (s > 0 && s < 0.7) {
      const k = s / 0.7;
      ctx.fillStyle = ORO;
      ctx.globalAlpha = 1 - k;
      for (const b of brotes) chispa(ctx, cx + Math.cos(b.ang) * b.vel * s, cy + Math.sin(b.ang) * b.vel * s, b.tam * (1 - 0.5 * k), s * 6);
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

/** Monedas que saltan de la tarjeta y vuelan al panel del total (que «recibe» cada una con un pulso). */
function crearMonedas({ origen: o, total, unidad = '€' }) {
  const px = o.x + o.ancho / 2;
  const py = o.y + o.alto / 2;
  const G = 520;
  const monedas = Array.from({ length: 16 }, (_, i) => {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const m = {
      x0: px + azar(-30, 30), y0: py, ang, vel: azar(220, 420),
      tB: 0.3 + i * 0.05 + azar(0, 0.08), dur: azar(0.55, 0.75),
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
        dibujarMoneda(ctx, mezcla(m.pB.x, total.x, e) + m.lado * 36 * Math.sin(Math.PI * u), mezcla(m.pB.y, total.y, e), 13 * (1 - 0.45 * e), t, m.fase, unidad);
      }
      // Pulso en el total cada vez que llega una moneda.
      const q = (t - (m.tB + m.dur)) / 0.35;
      if (q > 0 && q < 1) {
        ctx.globalAlpha = 0.55 * (1 - q);
        ctx.strokeStyle = ORO;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(total.x, total.y, 8 + 34 * q, 0, DOS_PI); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Confeti (sale de los lados de la tarjeta) ─────────────────────────────

const ARRASTRE_CONFETI = 2.5;   // el aire frena la subida
const CAIDA_CONFETI = 260;      // px/s: velocidad de caída final (el confeti flota)

function crearConfeti({ origen: o }) {
  const trozos = Array.from({ length: 150 }, (_, i) => {
    const izquierda = i % 2 === 0;
    return {
      ox: izquierda ? o.x + 14 : o.x + o.ancho - 14,
      oy: o.y + o.alto * 0.45,
      angulo: grados((izquierda ? -50 : -130) + (Math.random() - 0.5) * 50),   // cada lado lanza hacia fuera y arriba
      velocidad: azar(550, 1250),
      tamano: azar(7, 15),
      giro: (Math.random() - 0.5) * 900,
      fase: Math.random() * DOS_PI,
      color: COLORES[Math.floor(Math.random() * COLORES.length)],
    };
  });
  const duracion = 3.2;
  return (ctx, t) => {
    const frenado = (1 - Math.exp(-ARRASTRE_CONFETI * t)) / ARRASTRE_CONFETI;
    const caida = CAIDA_CONFETI * (t - frenado);
    const opacidad = limitar((duracion - t) / 0.8);
    for (const c of trozos) {
      const x = c.ox + Math.cos(c.angulo) * c.velocidad * frenado + Math.sin(t * 5 + c.fase) * 14 * Math.min(1, t);
      const y = c.oy + Math.sin(c.angulo) * c.velocidad * frenado + caida;
      const volteo = Math.max(0.12, Math.abs(Math.cos(t * 7 + c.fase)));   // gira sobre su eje: se ve de canto y de cara
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(grados(c.giro * t));
      ctx.globalAlpha = opacidad;
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.tamano / 2, -c.tamano * 0.3 * volteo, c.tamano, c.tamano * 0.6 * volteo);
      ctx.restore();
    }
  };
}

// ───────────────────────────── Fuegos artificiales (despegan de la tarjeta) ─────────────────────────────

const VUELO = 0.55;            // s que tarda el cohete en subir
const VIDA_CHISPA = 1.6;       // s que dura la explosión
const ARRASTRE_CHISPA = 2.2;
const GRAVEDAD_CHISPA = 170;   // px/s²
const CHISPAS_POR_COHETE = 56;
const INSTANTES_DESPEGUE = [0, 0.40, 0.80, 1.25, 1.70, 2.15];
const POSICIONES_X = [0.50, 0.22, 0.78, 0.36, 0.66, 0.50];

function crearFuegos({ ancho, alto, origen: o }) {
  const salidaX = o.x + o.ancho / 2;
  const salidaY = o.y;
  // Explotan en la parte alta de la pantalla; si la tarjeta está arriba, quedan cerca del borde superior.
  const techo = 80;
  const suelo = Math.max(techo + 40, Math.min(alto * 0.45, o.y - 100));
  const cohetes = INSTANTES_DESPEGUE.map((inicio, i) => ({
    ex: ancho * limitar(POSICIONES_X[i] + (Math.random() - 0.5) * 0.08, 0.1, 0.9),
    ey: azar(techo, suelo),
    inicio,
    color: COLORES[(i * 2 + Math.floor(Math.random() * 2)) % (COLORES.length - 1)],   // sin el blanco: es el brillo
    chispas: Array.from({ length: CHISPAS_POR_COHETE }, (_, j) => ({
      angulo: (DOS_PI * j) / CHISPAS_POR_COHETE + (Math.random() - 0.5) * 0.12,
      velocidad: j % 2 === 0 ? azar(480, 570) : azar(280, 350),
      blanca: j % 7 === 0,
    })),
  }));

  return (ctx, t) => {
    ctx.lineCap = 'round';
    for (const c of cohetes) {
      const s0 = t - c.inicio;
      if (s0 < 0) continue;

      if (s0 < VUELO) {
        // Subida desde la tarjeta: arranca rápido y frena al llegar arriba, dejando una estela.
        const en = (u) => { const v = limitar(u); const e = 1 - (1 - v) * (1 - v); return { x: mezcla(salidaX, c.ex, e), y: mezcla(salidaY, c.ey, e) }; };
        const u = s0 / VUELO;
        const a = en(u - 0.16);
        const b = en(u);
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, DOS_PI); ctx.fill();
        continue;
      }

      const s = s0 - VUELO;
      if (s >= VIDA_CHISPA) continue;

      // Destello de la explosión.
      if (s < 0.24) {
        const q = s / 0.24;
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.6 * (1 - q);
        ctx.beginPath(); ctx.arc(c.ex, c.ey, 26 + 60 * q, 0, DOS_PI); ctx.fill();
        ctx.fillStyle = c.color;
        ctx.globalAlpha = 0.25 * (1 - q);
        ctx.beginPath(); ctx.arc(c.ex, c.ey, 50 + 110 * q, 0, DOS_PI); ctx.fill();
      }

      const vida = 1 - s / VIDA_CHISPA;
      const sAntes = Math.max(0, s - 0.08);
      ctx.lineWidth = 2.6;
      for (const ch of c.chispas) {
        const d = (ch.velocidad * (1 - Math.exp(-ARRASTRE_CHISPA * s))) / ARRASTRE_CHISPA;
        const dAntes = (ch.velocidad * (1 - Math.exp(-ARRASTRE_CHISPA * sAntes))) / ARRASTRE_CHISPA;
        const cx = Math.cos(ch.angulo);
        const sy = Math.sin(ch.angulo);
        const x = c.ex + cx * d;
        const y = c.ey + sy * d + 0.5 * GRAVEDAD_CHISPA * s * s;
        const xAntes = c.ex + cx * dAntes;
        const yAntes = c.ey + sy * dAntes + 0.5 * GRAVEDAD_CHISPA * sAntes * sAntes;
        const titileo = 0.65 + 0.35 * Math.sin(s * 38 + ch.angulo * 5);
        ctx.globalAlpha = limitar(Math.pow(vida, 0.7) * titileo);
        ctx.strokeStyle = ch.blanca ? '#FFFFFF' : c.color;
        ctx.beginPath(); ctx.moveTo(xAntes, yAntes); ctx.lineTo(x, y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };
}

// ───────────────────────────── Registro ─────────────────────────────

export const EFECTOS = {
  confeti: { duracion: 3.2, vibraciones: [{ t: 0, ms: 60 }], crear: crearConfeti },
  fuegos: {
    duracion: 4.3,
    vibraciones: INSTANTES_DESPEGUE.map((t) => ({ t: t + VUELO, ms: 15 })),   // un golpecito en cada explosión
    crear: crearFuegos,
  },
  destello: { duracion: 1.5, vibraciones: [{ t: 0, ms: 12 }], crear: crearDestello },
  medalla: { duracion: 2.7, vibraciones: [{ t: 0.45, ms: 35 }], crear: crearMedalla },
  monedas: { duracion: 2.5, vibraciones: [{ t: 0.9, ms: 10 }, { t: 1.3, ms: 10 }, { t: 1.7, ms: 10 }], crear: crearMonedas },
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

// El logro final: destello fuerte + medalla de oro que cae sobre la tarjeta + monedas que vuelan al total.
EFECTOS.logro = componer([
  { nombre: 'destello', desfase: 0, opciones: { intensidad: 3 } },
  { nombre: 'medalla', desfase: 0, opciones: { metal: 'oro' } },
  { nombre: 'monedas', desfase: 0.9 },
]);

// ───────────────────────────── Reproductor ─────────────────────────────

/**
 * Dibuja los efectos en un <canvas> a pantalla completa y muestra el cartel (título + subtítulo) junto a la tarjeta.
 * `reproducir` acepta varios a la vez; `exclusivo` cancela los demás.
 */
export function crearReproductor({ canvas, cartel, efectos = EFECTOS }) {
  const ctx = canvas.getContext('2d');
  let activos = [];
  let marco = 0;
  let ancho = 0;
  let alto = 0;
  let temporizadorCartel = 0;
  let baseCartel = 'translate(-50%, -50%)';
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

  /** El cartel va pegado a la tarjeta: encima si hay sitio, debajo si la tarjeta está arriba del todo. */
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
    // A caballo sobre el borde superior de la tarjeta, como una etiqueta: así nunca tapa la cifra del total (que está
    // encima de la primera tarjeta) ni el aviso de abajo. Se mantiene bajo la cabecera si la tarjeta está arriba del todo.
    const mitad = cartel.offsetWidth / 2;
    cartel.style.left = `${limitar(origen.x + origen.ancho / 2, mitad + 8, Math.max(mitad + 8, ancho - mitad - 8))}px`;
    cartel.style.top = `${Math.max(origen.y, 80)}px`;
    cartel.style.transformOrigin = '50% 50%';
    baseCartel = 'translate(-50%, -50%)';
  }

  function ocultarCartel() {
    cartel.hidden = true;
    cartel.style.removeProperty('transform');
    cartel.style.removeProperty('opacity');
  }

  function terminar(a) {
    if (a.cartel) ocultarCartel();
    if (a.alTerminar) { const f = a.alTerminar; a.alTerminar = null; try { f(); } catch (e) { console.error(e); } }
  }

  function cuadro(ahora) {
    ctx.clearRect(0, 0, ancho, alto);
    activos = activos.filter((a) => {
      const t = (ahora - a.inicio) / 1000;
      if (t >= a.def.duracion) { terminar(a); return false; }
      try {
        while (a.vibraciones.length && a.vibraciones[0].t <= t) {
          const v = a.vibraciones.shift();
          if (a.vibrar) a.vibrar(v.ms);
        }
        ctx.save();
        a.dibujar(ctx, t);
        ctx.restore();
        if (a.cartel) {
          const f = t / a.def.duracion;
          cartel.style.transform = `${baseCartel} scale(${popIn(f / 0.10)})`;
          cartel.style.opacity = f < 0.78 ? '1' : String(limitar((1 - f) / 0.22));
        }
      } catch (error) {
        console.error('Error dibujando la animación', error);
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
    }
  }

  /**
   * @param nombre   clave de EFECTOS
   * @param opciones { titulo, subtitulo, animar (false = solo el cartel, sin movimiento), vibrar (fn|null), exclusivo,
   *                   escena ({ origen, insignia, total, color, unidad, porcentaje }), opciones (del hito), alTerminar }
   */
  function reproducir(nombre, { titulo, subtitulo, animar = true, vibrar = null, exclusivo = false, escena = {}, opciones = {}, alTerminar = null } = {}) {
    const def = efectos[nombre];
    if (!def) { if (alTerminar) alTerminar(); return; }
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
      if (alTerminar) alTerminar();
      return;
    }

    if (exclusivo) { for (const a of activos) terminar(a); activos = []; }
    for (const a of activos) a.cartel = false;     // el cartel es del último efecto lanzado
    if (titulo) mostrarCartel(titulo, subtitulo, escena.origen, escena.color);
    activos.push({
      def,
      dibujar: def.crear({ ancho, alto, ...escena }, opciones),
      inicio: performance.now(),
      vibraciones: [...def.vibraciones].sort((a, b) => a.t - b.t),
      vibrar,
      cartel: Boolean(titulo),
      alTerminar,
    });
    if (!marco) marco = requestAnimationFrame(cuadro);
  }

  window.addEventListener('resize', () => { if (!activos.length) ajustar(); });
  return { reproducir };
}
