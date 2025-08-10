/**
 * Apps Script code for AI Library Portal leaderboard API.
 *
 * Copy this entire file into a new Apps Script project attached to your
 * Google Sheets document. The script exposes two HTTP functions via
 * doGet and doPost to support a simple REST-like API:
 *
 *   GET  ?route=leaderboard      → returns the leaderboard as JSON
 *   POST { route:'upsertScore', user_id, alias, points, token } →
 *        inserts or updates a row in the sheet. Requires the
 *        correct TOKEN matching Script properties.
 *
 * The sheet must have a tab called "Scores" with columns:
 *   A: user_id (string)
 *   B: alias   (string)
 *   C: points  (number)
 *   D: updated_at (date/time)
 *
 * See README.md for instructions on deploying as a Web App and
 * configuring a TOKEN.
 */

const SHEET_NAME = 'Scores';
// Token is stored in Script Properties (Project Settings → Script properties)
const TOKEN = PropertiesService.getScriptProperties().getProperty('TOKEN');

function doOptions() {
  // Handle CORS preflight requests
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

function doGet(e) {
  const out = handleGet(e);
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({ 'Access-Control-Allow-Origin': '*' });
}

function doPost(e) {
  // Extract the token from URL params or JSON body
  let reqToken = '';
  try {
    if (e.postData && e.postData.contents) {
      const body = JSON.parse(e.postData.contents);
      reqToken = body.token || '';
    }
  } catch (err) {
    // ignore parse errors; will be handled later
  }
  if (!reqToken && e.parameter && e.parameter.token) reqToken = e.parameter.token;
  // Verify token
  if (TOKEN && TOKEN !== reqToken) {
    return makeJson({ ok: false, error: 'unauthorized' });
  }
  const out = handlePost(e);
  return makeJson(out);
}

function makeJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({ 'Access-Control-Allow-Origin': '*' });
}

function handleGet(e) {
  const route = String(e.parameter.route || '').toLowerCase();
  if (route === 'leaderboard') {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { ok: false, error: 'missing_sheet' };
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, data: [] };
    const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    const rows = values.map(row => ({
      user_id: String(row[0]),
      alias: String(row[1]),
      points: Number(row[2]) || 0,
      updated_at: row[3] ? new Date(row[3]).toISOString() : null
    }));
    rows.sort((a, b) => b.points - a.points);
    return { ok: true, data: rows.slice(0, 100) };
  }
  return { ok: false, error: 'unknown_route' };
}

function handlePost(e) {
  let body = {};
  try {
    if (e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
  } catch (err) {
    return { ok: false, error: 'bad_json' };
  }
  const route = String(body.route || e.parameter.route || '').toLowerCase();
  if (route === 'upsertScore') {
    const userId = String(body.user_id || '').trim();
    const alias = String(body.alias || '').trim();
    const points = Number(body.points) || 0;
    if (!userId) return { ok: false, error: 'missing_user_id' };
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { ok: false, error: 'missing_sheet' };
    const lastRow = sheet.getLastRow();
    // Look for existing row
    let updated = false;
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0]));
      const index = ids.findIndex(v => v === userId);
      if (index >= 0) {
        const rowNum = index + 2;
        sheet.getRange(rowNum, 2).setValue(alias);
        sheet.getRange(rowNum, 3).setValue(points);
        sheet.getRange(rowNum, 4).setValue(new Date());
        updated = true;
      }
    }
    if (!updated) {
      sheet.appendRow([userId, alias, points, new Date()]);
    }
    return { ok: true, updated };
  }
  return { ok: false, error: 'unknown_route' };
}