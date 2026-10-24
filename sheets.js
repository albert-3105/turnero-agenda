// Sincronización automática con Google Sheets.
// No hace nada hasta que exista `credenciales-google.json` y `config.json`
// tenga el `sheetId` puesto — mientras tanto el turnero funciona igual,
// solo no escribe en la hoja. Instrucciones completas en LEEME.md.

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const RUTA_CREDENCIALES = path.join(__dirname, "credenciales-google.json");
const RUTA_CONFIG = path.join(__dirname, "config.json");
const ENCABEZADO = ["Codigo", "Nombre", "TipoDocumento", "NumeroDocumento", "Telefono", "Correo", "Fecha", "HoraCreacion", "ExcepcionPicoYCedula", "MotivoExcepcion"];

let clienteSheets = null;
let encabezadoListo = false;

function cargarConfig() {
  if (!fs.existsSync(RUTA_CONFIG)) return {};
  try {
    return JSON.parse(fs.readFileSync(RUTA_CONFIG, "utf-8"));
  } catch {
    return {};
  }
}

function habilitado() {
  return fs.existsSync(RUTA_CREDENCIALES) && !!cargarConfig().sheetId;
}

async function obtenerCliente() {
  if (!clienteSheets) {
    const auth = new google.auth.GoogleAuth({
      keyFile: RUTA_CREDENCIALES,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    clienteSheets = google.sheets({ version: "v4", auth });
  }
  return clienteSheets;
}

async function asegurarEncabezado(sheets, sheetId) {
  if (encabezadoListo) return;
  const actual = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "A1:J1" });
  if (!actual.data.values || actual.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "A1:J1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [ENCABEZADO] },
    });
  }
  encabezadoListo = true;
}

// Se llama después de crear cada turno. No bloquea la respuesta al asesor:
// si falla (sin internet, hoja mal compartida, etc.) solo queda el registro
// local en /data — nunca impide generar el turno.
async function agregarFilaGoogleSheet(turno) {
  if (!habilitado()) return;
  try {
    const { sheetId } = cargarConfig();
    const sheets = await obtenerCliente();
    await asegurarEncabezado(sheets, sheetId);
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "A:J",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[turno.codigo, turno.nombre, turno.tipoDocumento, turno.documento, turno.telefono, turno.correo, turno.fecha, turno.horaCreacion, turno.excepcionPicoYCedula ? "Sí" : "No", turno.motivoExcepcion || ""]],
      },
    });
    console.log(`Turno ${turno.codigo} sincronizado con Google Sheets.`);
  } catch (e) {
    console.error(`No se pudo sincronizar el turno ${turno.codigo} con Google Sheets:`, e.message);
  }
}

module.exports = { agregarFilaGoogleSheet, habilitado };
