/* Per-device connection settings — the Airtable base this browser talks to.
   The base itself (SafeCheck) already exists and is shared by everyone;
   each device just needs a Personal Access Token to reach it. */

const AIRTABLE_BASE_ID = "appADYVuHuL3OeWmy";

const TOKEN_KEY = "safecheck_airtable_token_v1";

function getAirtableToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}

function setAirtableToken(token) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

function clearAirtableToken() {
  localStorage.removeItem(TOKEN_KEY);
}
