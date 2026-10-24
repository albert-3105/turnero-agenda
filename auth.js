// Autenticación simple con usuario y contraseña para proteger el turnero.
// No usa librerías externas (solo el módulo `crypto` de Node), así que no
// hace falta instalar nada nuevo.
//
// - Las credenciales se guardan en `usuarios.json` (se crea con el script
//   `node crear-usuario.js`). La contraseña NUNCA se guarda en texto plano,
//   solo un hash (scrypt) con su sal.
// - Al iniciar sesión se entrega una cookie de sesión (token aleatorio,
//   guardado en memoria del servidor). Dura 12 horas o hasta que se cierre
//   sesión o se reinicie el servidor.
// - Incluye un bloqueo temporal por IP después de varios intentos fallidos,
//   para dificultar adivinar la contraseña por fuerza bruta.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RUTA_USUARIOS = path.join(__dirname, "usuarios.json");
const DURACION_SESION_MS = 12 * 60 * 60 * 1000; // 12 horas
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 5 * 60 * 1000; // 5 minutos

const sesiones = new Map(); // token -> { usuario, expira }
const intentosFallidos = new Map(); // ip -> { cantidad, bloqueadoHasta }

function hayUsuarioConfigurado() {
  return fs.existsSync(RUTA_USUARIOS);
}

function leerUsuario() {
  if (!hayUsuarioConfigurado()) return null;
  try {
    return JSON.parse(fs.readFileSync(RUTA_USUARIOS, "utf-8"));
  } catch {
    return null;
  }
}

function guardarUsuario(usuario, contrasena) {
  const sal = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(contrasena, sal, 64).toString("hex");
  fs.writeFileSync(
    RUTA_USUARIOS,
    JSON.stringify({ usuario, sal, hash }, null, 2),
    "utf-8"
  );
}

function verificarCredenciales(usuario, contrasena) {
  const datos = leerUsuario();
  if (!datos) return false;
  if (usuario !== datos.usuario) return false;
  const hashIntento = crypto.scryptSync(contrasena, datos.sal, 64);
  const hashGuardado = Buffer.from(datos.hash, "hex");
  if (hashIntento.length !== hashGuardado.length) return false;
  return crypto.timingSafeEqual(hashIntento, hashGuardado);
}

// ── Control de intentos fallidos por IP ───────────────────────────────
function ipBloqueada(ip) {
  const registro = intentosFallidos.get(ip);
  if (!registro) return false;
  if (registro.bloqueadoHasta && Date.now() < registro.bloqueadoHasta) return true;
  if (registro.bloqueadoHasta && Date.now() >= registro.bloqueadoHasta) {
    intentosFallidos.delete(ip);
  }
  return false;
}

function registrarIntentoFallido(ip) {
  const registro = intentosFallidos.get(ip) || { cantidad: 0, bloqueadoHasta: null };
  registro.cantidad++;
  if (registro.cantidad >= MAX_INTENTOS) {
    registro.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  }
  intentosFallidos.set(ip, registro);
}

function limpiarIntentos(ip) {
  intentosFallidos.delete(ip);
}

// ── Sesiones ────────────────────────────────────────────────────────
function crearSesion(usuario) {
  const token = crypto.randomBytes(32).toString("hex");
  sesiones.set(token, { usuario, expira: Date.now() + DURACION_SESION_MS });
  return token;
}

function sesionValida(token) {
  if (!token) return false;
  const s = sesiones.get(token);
  if (!s) return false;
  if (Date.now() > s.expira) {
    sesiones.delete(token);
    return false;
  }
  return true;
}

function cerrarSesion(token) {
  sesiones.delete(token);
}

// ── Utilidades de cookies (sin dependencias externas) ──────────────
function leerCookie(req, nombre) {
  const encabezado = req.headers.cookie;
  if (!encabezado) return null;
  const partes = encabezado.split(";").map((p) => p.trim());
  for (const p of partes) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx);
    const v = p.slice(idx + 1);
    if (k === nombre) return decodeURIComponent(v);
  }
  return null;
}

function ponerCookieSesion(res, token) {
  const maxAgeSeg = Math.floor(DURACION_SESION_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `sesion=${token}; HttpOnly; Path=/; Max-Age=${maxAgeSeg}; SameSite=Lax`
  );
}

function borrarCookieSesion(res) {
  res.setHeader("Set-Cookie", "sesion=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

// Rutas que se pueden ver SIN haber iniciado sesión.
const RUTAS_PUBLICAS = new Set(["/login.html", "/api/login", "/favicon.ico"]);

function esRutaPublica(rutaUrl) {
  const ruta = rutaUrl.split("?")[0];
  if (RUTAS_PUBLICAS.has(ruta)) return true;
  if (ruta.startsWith("/img/")) return true; // logo, ícono
  return false;
}

// Middleware principal: exige sesión iniciada para todo lo demás.
function requerirSesion(req, res, next) {
  if (esRutaPublica(req.path)) return next();

  // Si todavía no se configuró ningún usuario, se manda siempre a la
  // pantalla de aviso en vez de dejar el turnero abierto sin protección.
  if (!hayUsuarioConfigurado()) {
    if (req.path.startsWith("/api/")) {
      return res.status(503).json({ error: "Todavía no se configuró un usuario. Ejecuta 'node crear-usuario.js' en el servidor." });
    }
    return res.redirect("/login.html");
  }

  const token = leerCookie(req, "sesion");
  if (sesionValida(token)) return next();

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "No has iniciado sesión." });
  }
  return res.redirect("/login.html");
}

module.exports = {
  hayUsuarioConfigurado,
  guardarUsuario,
  verificarCredenciales,
  ipBloqueada,
  registrarIntentoFallido,
  limpiarIntentos,
  crearSesion,
  cerrarSesion,
  leerCookie,
  ponerCookieSesion,
  borrarCookieSesion,
  requerirSesion,
  BLOQUEO_MS,
};
