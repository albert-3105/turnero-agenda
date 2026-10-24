// Servidor local de turnos SISBEN
// Corre en el computador de la oficina y sirve a las tablets/PC conectadas
// a la misma red local (LAN). No necesita internet para funcionar.

const express = require("express");
const path = require("path");
const fs = require("fs");
const { getTurnosDelDia, getTurnosPorFecha, agregarTurno, fechaISOHoy, TOPE_DIARIO, aCSV } = require("./db");
const { agregarFilaGoogleSheet, habilitado: sheetsHabilitado } = require("./sheets");
const { enviarRecordatorio, habilitado: correoHabilitado } = require("./correo");
const { permitidoHoy, grupoDeHoy, esFinDeSemana, nombreDiaSemana, etiquetaCorta } = require("./picoCedula");
const { iniciarResumenDiario } = require("./reporteAdmin");
const auth = require("./auth");

const app = express();
const PUERTO = process.env.PORT || 3000;

// Cuántos días hábiles hacia adelante se pueden agendar desde el calendario
// del asesor. Se puede ajustar en config.json con la clave "diasAgendaAnticipada".
const RUTA_CONFIG = path.join(__dirname, "config.json");
function leerConfig() {
  try {
    return JSON.parse(fs.readFileSync(RUTA_CONFIG, "utf-8"));
  } catch {
    return {};
  }
}
const DIAS_AGENDA_ANTICIPADA = leerConfig().diasAgendaAnticipada || 14;

app.use(express.json());

// ── Acceso con usuario y contraseña ───────────────────────────────────
// Todo lo que no sea /login.html, /api/login o /img/* exige haber
// iniciado sesión (ver auth.js). Va antes de express.static para que las
// páginas protegidas (asesor.html, admin.html) no se sirvan sin sesión.
app.post("/api/login", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "desconocida";

  if (auth.ipBloqueada(ip)) {
    return res.status(429).json({ error: "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo." });
  }

  const { usuario, contrasena } = req.body || {};
  if (!usuario || !contrasena) {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios." });
  }

  if (!auth.hayUsuarioConfigurado()) {
    return res.status(503).json({ error: "Todavía no se configuró un usuario. Ejecuta 'node crear-usuario.js' en el servidor." });
  }

  if (!auth.verificarCredenciales(usuario, contrasena)) {
    auth.registrarIntentoFallido(ip);
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

  auth.limpiarIntentos(ip);
  const token = auth.crearSesion(usuario);
  auth.ponerCookieSesion(res, token);
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const token = auth.leerCookie(req, "sesion");
  auth.cerrarSesion(token);
  auth.borrarCookieSesion(res);
  res.json({ ok: true });
});

// El navegador pide /favicon.ico por defecto en la raíz (además del ícono
// que ya se declara con <link rel="icon"> en cada página) — se sirve el
// mismo logo para que el ícono de la pestaña se vea siempre.
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "img", "logo.png"));
});

app.use(auth.requerirSesion);
app.use(express.static(path.join(__dirname, "public")));

// ── Utilidades de fecha ───────────────────────────────────────────────
// Convierte "YYYY-MM-DD" a un Date en hora local (evita el corrimiento de
// un día que da `new Date("YYYY-MM-DD")` por interpretarse como UTC).
function fechaDesdeISO(fechaISO) {
  const [a, m, d] = fechaISO.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function esFechaISOValida(fechaISO) {
  return typeof fechaISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fechaISO) && !isNaN(fechaDesdeISO(fechaISO).getTime());
}

// ── Calendario: próximos días hábiles disponibles para agendar ───────
app.get("/api/dias-disponibles", (req, res) => {
  const documento = req.query.documento ? String(req.query.documento).trim() : "";
  const cantidad = Math.min(Number(req.query.dias) || DIAS_AGENDA_ANTICIPADA, 60);

  const dias = [];
  const cursor = fechaDesdeISO(fechaISOHoy());
  let agregados = 0;
  let vueltas = 0;

  while (agregados < cantidad && vueltas < cantidad * 3) {
    vueltas++;
    if (!esFinDeSemana(cursor)) {
      const fechaISO = [
        cursor.getFullYear(),
        String(cursor.getMonth() + 1).padStart(2, "0"),
        String(cursor.getDate()).padStart(2, "0"),
      ].join("-");

      const turnosDelDia = getTurnosPorFecha(fechaISO);
      const lleno = turnosDelDia.length >= TOPE_DIARIO;
      const grupo = grupoDeHoy(cursor);
      const permitidoParaDocumento = documento ? permitidoHoy(documento, cursor) : null;

      dias.push({
        fecha: fechaISO,
        diaSemana: nombreDiaSemana(cursor),
        etiqueta: etiquetaCorta(cursor),
        grupo,
        cuposUsados: turnosDelDia.length,
        cuposTope: TOPE_DIARIO,
        lleno,
        permitidoParaDocumento,
        disponible: !lleno,
      });
      agregados++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  res.json({ dias });
});

// ── Crear un turno (lo usa el asesor) ────────────────────────────────
app.post("/api/turnos", (req, res) => {
  const { nombre, tipoDocumento, documento, telefono, correo } = req.body;

  if (!nombre || !nombre.trim() || nombre.trim().length < 3) {
    return res.status(400).json({ error: "El nombre completo es obligatorio." });
  }
  if (!tipoDocumento) {
    return res.status(400).json({ error: "Selecciona el tipo de documento." });
  }
  if (!documento || !/^\d{5,15}$/.test(documento.trim())) {
    return res.status(400).json({ error: "El número de documento debe tener solo dígitos." });
  }
  if (!telefono || !/^\d{7,10}$/.test(telefono.trim())) {
    return res.status(400).json({ error: "El teléfono debe tener entre 7 y 10 dígitos." });
  }
  if (correo && correo.trim() && !/^\S+@\S+\.\S+$/.test(correo.trim())) {
    return res.status(400).json({ error: "El correo no es válido." });
  }

  // ── Fecha del turno: la que eligió el ciudadano en el calendario del
  // asesor. Si no llega ninguna, se asume hoy (compatibilidad).
  const fechaISO = req.body.fecha && String(req.body.fecha).trim() ? String(req.body.fecha).trim() : fechaISOHoy();
  if (!esFechaISOValida(fechaISO)) {
    return res.status(400).json({ error: "La fecha del turno no es válida." });
  }
  const fechaTurno = fechaDesdeISO(fechaISO);
  const hoy = fechaDesdeISO(fechaISOHoy());
  if (fechaTurno < hoy) {
    return res.status(400).json({ error: "No se puede agendar un turno en una fecha pasada." });
  }
  if (esFinDeSemana(fechaTurno)) {
    return res.status(400).json({ error: "La oficina no atiende los fines de semana. Elige un día hábil." });
  }

  const { excepcion, motivoExcepcion } = req.body;
  if (!excepcion && !permitidoHoy(documento, fechaTurno)) {
    const grupo = grupoDeHoy(fechaTurno);
    return res.status(403).json({
      error: `Por pico y cédula, el ${etiquetaCorta(fechaTurno)} solo se atienden cédulas terminadas en dígito ${grupo}. Si es una excepción (adulto mayor, discapacidad, urgencia, etc.), marca la casilla de excepción, o elige otro día en el calendario.`,
      picoYCedula: true,
    });
  }

  const turnosDelDia = getTurnosPorFecha(fechaISO);
  if (turnosDelDia.some((t) => t.documento === documento.trim()) && !excepcion) {
    return res.status(409).json({ error: `Este número de documento ya tiene un turno agendado para el ${etiquetaCorta(fechaTurno)}.` });
  }
  if (turnosDelDia.length >= TOPE_DIARIO) {
    return res.status(409).json({ error: `Se alcanzó el límite de ${TOPE_DIARIO} turnos para el ${etiquetaCorta(fechaTurno)}. Elige otro día.` });
  }

  const turno = agregarTurno(
    {
      nombre: nombre.trim(),
      tipoDocumento,
      documento: documento.trim(),
      telefono: telefono.trim(),
      correo: correo ? correo.trim() : "",
      excepcionPicoYCedula: !!excepcion,
      motivoExcepcion: excepcion && motivoExcepcion ? motivoExcepcion.trim() : "",
    },
    fechaISO
  );

  // Se sincroniza con Google Sheets y se envía el correo en segundo plano:
  // si falla (sin internet, credenciales mal puestas, etc.) el turno igual
  // queda guardado localmente y el asesor no se ve afectado.
  agregarFilaGoogleSheet(turno);
  enviarRecordatorio(turno);

  res.status(201).json(turno);
});

// ── Listar los turnos de un día (lo usa la pantalla de administración) ─
// Por defecto muestra los de hoy; ?fecha=YYYY-MM-DD para ver otro día.
app.get("/api/turnos", (req, res) => {
  const fechaISO = req.query.fecha && esFechaISOValida(req.query.fecha) ? req.query.fecha : fechaISOHoy();
  res.json({ tope: TOPE_DIARIO, fecha: fechaISO, turnos: getTurnosPorFecha(fechaISO) });
});

// ── Descargar el listado de un día en CSV, para subir a Google Sheets ─
app.get("/api/turnos/csv", (req, res) => {
  const fechaISO = req.query.fecha && esFechaISOValida(req.query.fecha) ? req.query.fecha : fechaISOHoy();
  const csv = aCSV(getTurnosPorFecha(fechaISO));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="turnos-${fechaISO}.csv"`);
  res.send("\uFEFF" + csv); // BOM para que Excel/Sheets reconozcan tildes
});

app.get("/api/estado", (req, res) => {
  const fechaISO = req.query.fecha && esFechaISOValida(req.query.fecha) ? req.query.fecha : fechaISOHoy();
  const fecha = fechaDesdeISO(fechaISO);
  res.json({
    sheetsActivo: sheetsHabilitado(),
    correoActivo: correoHabilitado(),
    fecha: fechaISO,
    grupoHoy: grupoDeHoy(fecha),
  });
});

app.listen(PUERTO, "0.0.0.0", () => {
  const nets = require("os").networkInterfaces();
  const ips = Object.values(nets).flat().filter((n) => n.family === "IPv4" && !n.internal).map((n) => n.address);
  console.log(`\nServidor de turnos SISBEN corriendo.`);
  console.log(`  En este computador:  http://localhost:${PUERTO}/asesor.html`);
  ips.forEach((ip) => console.log(`  Desde la tablet:     http://${ip}:${PUERTO}/asesor.html`));
  console.log(`  Panel de descarga:   http://localhost:${PUERTO}/admin.html`);
  console.log(`  Google Sheets:       ${sheetsHabilitado() ? "activo ✔" : "no configurado (ver LEEME.md)"}`);
  console.log(`  Correo recordatorio: ${correoHabilitado() ? "activo ✔" : "no configurado (ver LEEME.md)"}`);
  if (!auth.hayUsuarioConfigurado()) {
    console.log(`  ⚠️  Acceso:            SIN CONFIGURAR — ejecuta "node crear-usuario.js" para crear el usuario y contraseña.`);
  } else {
    console.log(`  Acceso:              protegido con usuario y contraseña ✔`);
  }
  console.log("");
  iniciarResumenDiario();
});
