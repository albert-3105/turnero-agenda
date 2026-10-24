// Correo diario al administrador, todos los días a las 6:00 a.m., con el
// número de turnos ya agendados para ese día (los ciudadanos agendan con
// anticipación desde el calendario, así que a las 6am ya puede haber turnos).

const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { getTurnosPorFecha, fechaISOHoy, TOPE_DIARIO } = require("./db");
const { enviarCorreoGenerico, habilitado: correoHabilitado } = require("./correo");

const RUTA_CONFIG = path.join(__dirname, "config.json");

function cargarConfig() {
  try {
    return JSON.parse(fs.readFileSync(RUTA_CONFIG, "utf-8"));
  } catch {
    return {};
  }
}

async function enviarResumenDiario() {
  const { correoAdmin } = cargarConfig();
  if (!correoHabilitado() || !correoAdmin) return;

  const fechaISO = fechaISOHoy();
  const turnos = getTurnosPorFecha(fechaISO);
  const fechaLegible = new Date(fechaISO + "T00:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });

  await enviarCorreoGenerico({
    para: correoAdmin,
    asunto: `Turnos SISBÉN de hoy: ${turnos.length}`,
    texto: `Buenos días,\n\nPara hoy (${fechaLegible}) tienes ${turnos.length} de ${TOPE_DIARIO} turnos agendados.\n\nEste es un mensaje automático, no respondas a este correo.`,
  });
}

function iniciarResumenDiario() {
  // Todos los días a las 6:00 a.m., hora del servidor.
  cron.schedule("0 6 * * *", enviarResumenDiario);
}

module.exports = { iniciarResumenDiario, enviarResumenDiario };
