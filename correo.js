// Envío del correo de confirmación/recordatorio del turno.
// No hace nada hasta que `config.json` tenga los datos de `smtp` puestos —
// mientras tanto el turnero sigue funcionando igual, solo no envía correo.

const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const RUTA_CONFIG = path.join(__dirname, "config.json");
let transportador = null;

function cargarConfig() {
  if (!fs.existsSync(RUTA_CONFIG)) return {};
  try {
    return JSON.parse(fs.readFileSync(RUTA_CONFIG, "utf-8"));
  } catch {
    return {};
  }
}

function habilitado() {
  const { smtp } = cargarConfig();
  return !!(smtp && smtp.host && smtp.usuario && smtp.clave);
}

function obtenerTransportador() {
  if (!transportador) {
    const { smtp } = cargarConfig();
    transportador = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.puerto || 587,
      secure: !!smtp.seguro, // true para el puerto 465, false para 587
      auth: { user: smtp.usuario, pass: smtp.clave },
    });
  }
  return transportador;
}

// Se llama después de crear cada turno. No bloquea la respuesta al asesor:
// si falla (sin internet, credenciales mal puestas, etc.) el turno igual
// queda generado con normalidad.
async function enviarRecordatorio(turno) {
  if (!habilitado() || !turno.correo) return;
  try {
    const { smtp } = cargarConfig();
    const cliente = obtenerTransportador();
    const hoyISO = new Date().toISOString().slice(0, 10);
    const esHoy = turno.fecha === hoyISO;
    const cuandoAsunto = esHoy ? "de hoy" : `del ${turno.fecha}`;
    const cuandoCuerpo = esHoy ? "para hoy" : `para el día ${turno.fecha}`;
    await cliente.sendMail({
      from: smtp.remitente || smtp.usuario,
      to: turno.correo,
      subject: `Tu turno SISBÉN ${cuandoAsunto}: ${turno.codigo}`,
      text:
        `Hola ${turno.nombre},\n\n` +
        `Se generó tu turno ${cuandoCuerpo} en el punto de atención SISBÉN.\n\n` +
        `Turno: ${turno.codigo}\n` +
        `Fecha: ${turno.fecha}\n` +
        `Documento: ${turno.tipoDocumento} ${turno.documento}\n\n` +
        `Por favor está atento(a) al llamado de tu turno el día de la cita. Si te ausentas cuando te llamen, ` +
        `es posible que debas volver a tomar turno.\n\n` +
        `Este es un mensaje automático, no respondas a este correo.`,
    });
    console.log(`Recordatorio enviado a ${turno.correo} (turno ${turno.codigo}).`);
  } catch (e) {
    console.error(`No se pudo enviar el recordatorio del turno ${turno.codigo}:`, e.message);
  }
}

async function enviarCorreoGenerico({ para, asunto, texto }) {
  if (!habilitado() || !para) return;
  try {
    const { smtp } = cargarConfig();
    const cliente = obtenerTransportador();
    await cliente.sendMail({ from: smtp.remitente || smtp.usuario, to: para, subject: asunto, text: texto });
    console.log(`Correo enviado a ${para}: "${asunto}"`);
  } catch (e) {
    console.error(`No se pudo enviar el correo a ${para}:`, e.message);
  }
}

module.exports = { enviarRecordatorio, enviarCorreoGenerico, habilitado };
