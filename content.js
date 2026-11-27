// Контентный скрипт FACEIT Ping Inspector
let activeMatchId = null;
let currentIp = null;
let currentPort = null;
let hudElement = null;
let isCollapsed = false;
let isFetchingApi = false;

// Извлечение MatchId из адресной строки
function getMatchIdFromUrl() {
  const m = window.location.pathname.match(/\/room\/([a-zA-Z0-9-]+)/i);
  return m ? m[1] : null;
}

// Запрос данных матча через сессию браузера
async function fetchMatchServerFromApi(matchId) {
  if (!matchId || isFetchingApi) return null;
  isFetchingApi = true;
  try {
    const res = await fetch(`https://api.faceit.com/match/v2/match/${matchId}`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      const p = data.payload || {};
      if (p.server && p.server.ip) {
        return { ip: p.server.ip, port: parseInt(p.server.port || 27015, 10) };
      }
      if (p.configured_server && p.configured_server.ip) {
        return { ip: p.configured_server.ip, port: parseInt(p.configured_server.port || 27015, 10) };
      }
      const found = deepSearchServerInObj(p, 0);
      if (found) return found;
    }
  } catch (e) {
  } finally {
    isFetchingApi = false;
  }
  return null;
}

function deepSearchServerInObj(obj, depth) {
  if (!obj || depth > 5 || typeof obj !== 'object') return null;
  if (obj.ip && typeof obj.ip === 'string' && /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(obj.ip)) {
    return { ip: obj.ip, port: parseInt(obj.port || 27015, 10) };
  }
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      const res = deepSearchServerInObj(obj[k], depth + 1);
      if (res) return res;
    }
  }
  return null;
}

// Поиск IP в DOM
function scanDomForServer() {
  const steamLinks = document.querySelectorAll('a[href*="steam://connect/"], a[href*=":27"]');
  for (const a of steamLinks) {
    const m = a.href.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/);
    if (m) return { ip: m[1], port: parseInt(m[2], 10) };
  }

  const attrEls = document.querySelectorAll('[data-clipboard-text], [data-ip], [data-value], [title], [aria-label]');
  for (const el of attrEls) {
    const val = el.getAttribute('data-clipboard-text') || el.getAttribute('data-ip') || el.title || el.getAttribute('aria-label') || '';
    const m = val.match(/(?:connect\s+)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/i);
    if (m) return { ip: m[1], port: parseInt(m[2], 10) };
  }

  const text = document.body ? document.body.innerText : '';
  const tm = text.match(/(?:connect\s+)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/i);
  if (tm) return { ip: tm[1], port: parseInt(tm[2], 10) };

  return null;
}

// Создание плавающего виджета снизу справа
function ensureFloatingHud() {
  if (hudElement && document.contains(hudElement)) return;

  hudElement = document.createElement('div');
  hudElement.id = 'faceit-ping-hud';
  hudElement.className = 'fip-hud-container';
  hudElement.innerHTML = `
    <!-- Кнопка свернутого состояния -->
    <div id="fip-hud-pill" class="fip-hud-pill">
      <span class="fip-pill-dot"></span>
      <span id="fip-pill-text" class="fip-pill-text">PING</span>
    </div>

    <!-- Полное развернутое окно -->
    <div id="fip-hud-card" class="fip-hud-card">
      <div class="fip-card-header">
        <span class="fip-header-dot"></span>
        <span class="fip-header-title">FACEIT PING</span>
        <span id="fip-status-badge" class="fip-badge fip-status-pending">Поиск...</span>
        <button id="fip-btn-toggle" class="fip-btn-icon" title="Свернуть">-</button>
      </div>

      <div class="fip-card-body">
        <div class="fip-row">
          <span class="fip-label">Сервер:</span>
          <span id="fip-val-ip" class="fip-val">Ожидание...</span>
        </div>
        <div class="fip-row">
          <span class="fip-label">Задержка:</span>
          <span id="fip-val-ping" class="fip-val fip-val-ping">-- мс</span>
        </div>
        <div class="fip-row">
          <span class="fip-label">Узел:</span>
          <span id="fip-val-node" class="fip-val">--</span>
        </div>
      </div>

      <div class="fip-card-actions">
        <button id="fip-btn-check" class="fip-btn fip-btn-primary">Замер</button>
        <button id="fip-btn-trace" class="fip-btn secondary">Маршрут</button>
        <button id="fip-btn-copy" class="fip-btn secondary">Копия</button>
      </div>

      <!-- Детальная трассировка -->
      <div id="fip-trace-box" class="fip-trace-box fip-hidden">
        <div class="fip-trace-header">
          <span>Трассировка узлов</span>
          <span id="fip-trace-close" class="fip-trace-close">x</span>
        </div>
        <div id="fip-trace-list" class="fip-trace-list">
          <div class="fip-trace-loading">Загрузка маршрута...</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(hudElement);

  const pill = hudElement.querySelector('#fip-hud-pill');
  const card = hudElement.querySelector('#fip-hud-card');
  const btnToggle = hudElement.querySelector('#fip-btn-toggle');
  const btnCheck = hudElement.querySelector('#fip-btn-check');
  const btnTrace = hudElement.querySelector('#fip-btn-trace');
  const btnCopy = hudElement.querySelector('#fip-btn-copy');
  const traceBox = hudElement.querySelector('#fip-trace-box');
  const traceClose = hudElement.querySelector('#fip-trace-close');

  // Сворачивание и разворачивание
  pill.addEventListener('click', () => {
    isCollapsed = false;
    applyCollapseState();
  });

  btnToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    isCollapsed = true;
    applyCollapseState();
  });

  // Замер
  btnCheck.addEventListener('click', () => {
    if (currentIp) {
      runPing(currentIp, currentPort);
    } else {
      checkMatchAndDom();
    }
  });

  // Трассировка
  btnTrace.addEventListener('click', () => {
    if (currentIp) {
      runTrace(currentIp, currentPort);
    }
  });

  traceClose.addEventListener('click', () => {
    traceBox.classList.add('fip-hidden');
  });

  // Копирование
  btnCopy.addEventListener('click', () => {
    if (currentIp) {
      const cleanIp = String(currentIp).split(':')[0].trim();
      const port = currentPort || 27015;
      navigator.clipboard.writeText(`connect ${cleanIp}:${port}`);
      btnCopy.textContent = "Готово";
      setTimeout(() => { btnCopy.textContent = "Копия"; }, 1500);
    }
  });

  applyCollapseState();
}

function applyCollapseState() {
  if (!hudElement) return;
  const pill = hudElement.querySelector('#fip-hud-pill');
  const card = hudElement.querySelector('#fip-hud-card');
  if (isCollapsed) {
    pill.classList.remove('fip-hidden');
    card.classList.add('fip-hidden');
  } else {
    pill.classList.add('fip-hidden');
    card.classList.remove('fip-hidden');
  }
}

// Обновление UI
function updateUi(server, pingData) {
  ensureFloatingHud();

  const pillText = document.getElementById('fip-pill-text');
  const valIp = document.getElementById('fip-val-ip');
  const valPing = document.getElementById('fip-val-ping');
  const valNode = document.getElementById('fip-val-node');
  const statusBadge = document.getElementById('fip-status-badge');

  if (!server) {
    if (valIp) valIp.textContent = "Ожидание сервера";
    if (valPing) valPing.textContent = "-- мс";
    if (valNode) valNode.textContent = "Голосование...";
    if (statusBadge) {
      statusBadge.textContent = "Ожидание";
      statusBadge.className = "fip-badge fip-status-pending";
    }
    if (pillText) pillText.textContent = "PING";
    return;
  }

  const cleanIp = String(server.ip).split(':')[0].trim();
  const port = server.port || 27015;
  if (valIp) valIp.textContent = `${cleanIp}:${port}`;

  const classification = (pingData && pingData.classification) || {};
  if (valNode) valNode.textContent = classification.provider || "FACEIT Server";

  if (pingData && pingData.success && pingData.ping !== undefined) {
    if (valPing) valPing.textContent = `${pingData.ping} мс`;
    if (pillText) pillText.textContent = `${pingData.ping} ms`;

    if (pingData.ping < 65 && classification.risk !== "high") {
      statusBadge.textContent = "Стабильно";
      statusBadge.className = "fip-badge fip-status-good";
    } else if (pingData.ping < 120 && classification.risk !== "high") {
      statusBadge.textContent = "Средний";
      statusBadge.className = "fip-badge fip-status-mid";
    } else {
      statusBadge.textContent = "Высокий пинг";
      statusBadge.className = "fip-badge fip-status-bad";
    }
  } else {
    const est = classification.estPing || (pingData && pingData.estPing) || "~50-90 мс";
    if (valPing) valPing.textContent = est;
    if (pillText) pillText.textContent = est;

    if (classification.risk === "high") {
      statusBadge.textContent = "Риск 220+";
      statusBadge.className = "fip-badge fip-status-bad";
    } else {
      statusBadge.textContent = "Обычный";
      statusBadge.className = "fip-badge fip-status-good";
    }
  }
}

// Запуск пинга
function runPing(ip, port) {
  const cleanIp = String(ip).split(':')[0].trim();
  const statusBadge = document.getElementById('fip-status-badge');
  if (statusBadge) {
    statusBadge.textContent = "Замер...";
    statusBadge.className = "fip-badge fip-status-pending";
  }

  chrome.runtime.sendMessage({ action: "ping_server", ip: cleanIp, port: port }, (resp) => {
    updateUi({ ip: cleanIp, port: port }, resp);
  });
}

// Запуск детальной трассировки
function runTrace(ip, port) {
  const cleanIp = String(ip).split(':')[0].trim();
  const traceBox = document.getElementById('fip-trace-box');
  const traceList = document.getElementById('fip-trace-list');
  const btnTrace = document.getElementById('fip-btn-trace');
  if (!traceBox || !traceList) return;

  traceBox.classList.remove('fip-hidden');
  traceList.innerHTML = `<div class="fip-trace-loading">Трассировка ${cleanIp}...</div>`;
  if (btnTrace) btnTrace.textContent = "...";

  chrome.runtime.sendMessage({ action: "trace_server", ip: cleanIp }, (resp) => {
    if (btnTrace) btnTrace.textContent = "Маршрут";

    if (!resp || !resp.success || !resp.hops || resp.hops.length === 0) {
      const errMsg = (resp && resp.error) ? resp.error : "Сбой трассировки";
      traceList.innerHTML = `<div class="fip-trace-err">${errMsg}</div>`;
      return;
    }

    let html = '';
    resp.hops.forEach(h => {
      let rttText = h.rtt >= 0 ? `${h.rtt} мс` : '*';
      let rttClass = 'fip-hop-good';
      if (h.rtt > 120) rttClass = 'fip-hop-bad';
      else if (h.rtt > 65) rttClass = 'fip-hop-mid';
      if (h.rtt === -1) rttClass = 'fip-hop-timeout';

      html += `
        <div class="fip-trace-item">
          <span class="fip-hop-num">${h.hop}</span>
          <span class="fip-hop-ip">${h.ip}</span>
          <span class="fip-hop-rtt ${rttClass}">${rttText}</span>
          <span class="fip-hop-lbl">${h.label}</span>
        </div>
      `;
    });
    traceList.innerHTML = html;
  });
}

// Периодическая проверка
async function checkMatchAndDom() {
  ensureFloatingHud();

  const matchId = getMatchIdFromUrl();
  if (matchId && matchId !== activeMatchId) {
    activeMatchId = matchId;
    currentIp = null;
    currentPort = null;
    updateUi(null, null);

    const apiServer = await fetchMatchServerFromApi(matchId);
    if (apiServer) {
      currentIp = apiServer.ip;
      currentPort = apiServer.port;
      runPing(currentIp, currentPort);
      return;
    }
  }

  const domServer = scanDomForServer();
  if (domServer && (domServer.ip !== currentIp || domServer.port !== currentPort)) {
    currentIp = domServer.ip;
    currentPort = domServer.port;
    runPing(currentIp, currentPort);
    return;
  }

  if (!currentIp) {
    chrome.storage.local.get(["lastServer"], (data) => {
      if (data.lastServer && Date.now() - (data.lastServer.timestamp || 0) < 3600000) {
        currentIp = data.lastServer.ip;
        currentPort = data.lastServer.port;
        updateUi({ ip: currentIp, port: currentPort }, data.lastServer.result);
      }
    });
  }
}

setInterval(checkMatchAndDom, 1500);
setTimeout(checkMatchAndDom, 500);
