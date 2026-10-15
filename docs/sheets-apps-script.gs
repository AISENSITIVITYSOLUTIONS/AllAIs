/**
 * AllAIs → Google Sheets
 * Recibe los eventos que manda la función "api" y los escribe en pestañas:
 *   Visitas   — cada inicio de sesión (email o código, método, ubicación aproximada)
 *   Consultas — cada consulta (email o código, modelo, resultado, consultas restantes)
 *   Usuarios  — una fila por email con total de visitas y consultas (se actualiza sola)
 *
 * Instalación: Extensiones → Apps Script, pegar este archivo, cambiar TOKEN,
 * Implementar → Nueva implementación → Aplicación web → Ejecutar como: Yo; Acceso: Cualquier usuario.
 */
const TOKEN = "CAMBIA-ESTE-TOKEN";

const HEADERS = {
  Visitas: ["Fecha", "Email", "Método", "Código", "País", "Estado", "Ciudad", "Navegador", "Referencia", "UTM"],
  Consultas: ["Fecha", "Email", "Código", "Modelo", "Resultado", "Consultas restantes", "Detalle"],
  Usuarios: ["Email", "Primera visita", "Última actividad", "Visitas", "Consultas"]
};

function sheet_(name) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName(name);
  if (!sh) {
    sh = book.insertSheet(name);
    sh.appendRow(HEADERS[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight("bold");
  }
  return sh;
}

function touchUser_(email, at, field) {
  if (!email) return;
  const sh = sheet_("Usuarios");
  const values = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map((r) => r[0]);
  const index = values.indexOf(email);
  if (index === -1) {
    sh.appendRow([email, at, at, field === "visitas" ? 1 : 0, field === "consultas" ? 1 : 0]);
    return;
  }
  const row = index + 2;
  sh.getRange(row, 3).setValue(at);
  const col = field === "visitas" ? 4 : 5;
  sh.getRange(row, col).setValue(Number(sh.getRange(row, col).getValue() || 0) + 1);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents || "{}");
  if (data.token !== TOKEN) return ContentService.createTextOutput("forbidden");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const at = new Date(data.at || Date.now());
    if (data.type === "visita") {
      sheet_("Visitas").appendRow([at, data.email || "", data.metodo || "", data.codigo || "", data.pais || "", data.estado || "", data.ciudad || "", data.navegador || "", data.referencia || "", data.utm || ""]);
      touchUser_(data.email, at, "visitas");
    } else if (data.type === "consulta") {
      sheet_("Consultas").appendRow([at, data.email || "", data.codigo || "", data.modelo || "", data.resultado || "", data.restantes ?? "", data.detalle || ""]);
      touchUser_(data.email, at, "consultas");
    }
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput("ok");
}
