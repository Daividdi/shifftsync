const https = require("https");
const http  = require("http");

const AUTH_URL = process.env.FACEUM_AUTH_URL || "https://faceum-api.dtfaceum.com";
const API_URL  = process.env.FACEUM_API_URL  || "https://dtfaceum.com:37000";
const USERNAME = process.env.FACEUM_USERNAME;
const PASSWORD = process.env.FACEUM_PASSWORD;

let _token       = null;
let _tokenExpiry = 0;
const TOKEN_TTL  = 50 * 60 * 1000; // 50 min

function request(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === "https:" ? 443 : 80),
      path:     url.pathname + url.search,
      method:   opts.method || "GET",
      headers:  { "Content-Type": "application/json", ...(opts.headers || {}) },
      rejectUnauthorized: false,
    }, res => {
      let body = "";
      res.on("data", c => (body += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body }); }
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  if (!USERNAME || !PASSWORD)
    throw new Error("FACEUM_USERNAME / FACEUM_PASSWORD não configurados no .env");

  const res = await request(`${AUTH_URL}/api/user/login`, {
    method: "POST",
    body:   { username: USERNAME, password: PASSWORD },
  });

  const token = res.headers["authorization"];
  if (!token)
    throw new Error(`Autenticação Faceum falhou: HTTP ${res.status} — ${JSON.stringify(res.body)}`);

  _token       = token;
  _tokenExpiry = Date.now() + TOKEN_TTL;
  return _token;
}

async function apiGet(path) {
  const token = await getToken();
  const res = await request(`${API_URL}${path}`, { headers: { Authorization: token } });
  if (res.status !== 200)
    throw new Error(`Faceum API error ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function apiPost(path, body) {
  const token = await getToken();
  const res = await request(`${API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: token },
    body,
  });
  if (res.status !== 200)
    throw new Error(`Faceum API error ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function getClocks(beginMs, endMs) {
  const data = await apiPost("/api/report/getClocksForApi", {
    beginningMilliseconds: beginMs,
    endingMilliseconds:    endMs,
    sentAfterMilliseconds: 0,
    timezone:              "America/Sao_Paulo",
    showEvents:            true,
  });
  // Response: { data: [ { clocks: [...] }, ... ] }
  const groups = data.data || [];
  return groups.flatMap(g => g.clocks || []);
}

async function getClocksByCpf(cpf, beginMs, endMs) {
  const data = await apiGet(
    `/api/clock/getByColaboradorCpf?cpf=${encodeURIComponent(cpf)}&beginningMilliseconds=${beginMs}&endingMilliseconds=${endMs}&timezone=America%2FSao_Paulo`
  );
  return data.daysWithClocks || [];
}

async function getColaboradores() {
  const all = [];
  let page = 0;
  const size = 500;
  while (true) {
    const data = await apiGet(`/api/colaborador/list?page=${page}&size=${size}`);
    const list = data.colaboradores || [];
    all.push(...list);
    if ((data.pagination || {}).last !== false) break; // last page or no pagination info
    page++;
  }
  return all;
}

async function getEvents() {
  const data = await apiGet("/api/events/list");
  return data.events || [];
}

module.exports = { getToken, getColaboradores, getClocks, getClocksByCpf, getEvents };
