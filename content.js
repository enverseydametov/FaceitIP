// Контентный скрипт FACEIT Ping Inspector с плавающим HUD и авто-поиском
let activeMatchId = null;
let currentIp = null;
let currentPort = null;
let hudElement = null;
let inlineWidget = null;
let isFetchingApi = false;

// Извлечение MatchId из адресной строки
function getMatchIdFromUrl() {
  const m = window.location.pathname.match(/\/room\/([a-zA-Z0-9-]+)/i);
  return m ? m[1] : null;
}

// Запрос данных матча через авторизованный API браузера
async function fetchMatchServerFromApi(matchId) {
  if (!matchId || isFetchingApi) return null;
  isFetchingApi = true;
  try {
    const res = await fetch(`https://api.faceit.com/match/v2/match/${matchId}`, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    if (res.ok) {
      const data = await res.json();
      const p = data.payload || {};
      
      // Поиск объекта сервера в разных ветках ответа
      if (p.server && p.server.ip) {
        return { ip: p.server.ip, port: parseInt(p.server.port || 27015, 10) };
      }
      if (p.configured_server && p.configured_server.ip) {
        return { ip: p.configured_server.ip, port: parseInt(p.configured_server.port || 27015, 10) };
      }
      
      // Рекурсивный поиск IP:port в JSON
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

// Поиск IP в DOM страницы
function scanDomForServer() {
  // 1. Поиск в ссылках steam://connect
  const steamLinks = document.querySelectorAll('a[href*="steam://connect/"], a[href*=":27"]');
  for (const a of steamLinks) {
    const m = a.href.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/);
    if (m) return { ip: m[1], port: parseInt(m[2], 10) };
  }

  // 2. Поиск по атрибутам клипборда и data-тегам
  const attrEls = document.querySelectorAll('[data-clipboard-text], [data-ip], [data-value], [title], [aria-label]');
  for (const el of attrEls) {
    const val = el.getAttribute('data-clipboard-text') || el.getAttribute('data-ip') || el.title || el.getAttribute('aria-label') || '';
    const m = val.match(/(?:connect\s+)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/i);
    if (m) return { ip: m[1], port: parseInt(m[2], 10) };
  }

  // 3. Поиск по тексту в теле документа
  const text = document.body ? document.body.innerText : '';
  const tm = text.match(/(?:connect\s+)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/i);
  if (tm) return { ip: tm[1], port: parseInt(tm[2], 10) };

  return null;
}

// Создание плавающего HUD индикатора (всегда поверх страницы)
function ensureFloatingHud() {
  if (hudElement && document.contains(hudElement)) return;

  hudElement = document.createElement('div');
  hudElement.id = 'faceit-ping-floating-hud';
  hudElement.innerHTML = `
    <div class="fip-hud-header">
      <span class="fip-hud-dot"></span>
      <span class="fip-hud-brand">FACEIT PING</span>
      <span class="fip-hud-status fip-status-pending">Поиск...</span>
    </div>
    <div class="fip-hud-content">
      <div class="fip-hud-row">
        <span class="fip-hud-label">Сервер:</span>
        <span id="fip-hud-ip" class="fip-hud-val">Ожидание матча</span>
      </div>
      <div class="fip-hud-row">
        <span class="fip-hud-label">Задержка:</span>
        <span id="fip-hud-ping" class="fip-hud-val fip-hud-highlight">-- мс</span>
      </div>
      <div class="fip-hud-row">
        <span class="fip-hud-label">Узел:</span>
        <span id="fip-hud-node" class="fip-hud-val">--</span>
      </div>
    </div>
    <div class="fip-hud-actions">
      <button id="fip-hud-btn-check" class="fip-hud-btn">Замер</button>
      <button id="fip-hud-btn-copy" class="fip-hud-btn secondary">Копия</button>
    </div>
  `;

  document.body.appendChild(hudElement);

  const btnCheck = hudElement.querySelector('#fip-hud-btn-check');
  const btnCopy = hudElement.querySelector('#fip-hud-btn-copy');

  btnCheck.addEventListener('click', () => {
    if (currentIp) {
      runPing(currentIp, currentPort);
    } else {
      checkMatchAndDom();
    }
  });

  btnCopy.addEventListener('click', () => {
    if (currentIp) {
      navigator.clipboard.writeText(`connect ${currentIp}:${currentPort}`);
      btnCopy.textContent = "Готово";
      setTimeout(() => { btnCopy.textContent = "Копия"; }, 1500);
    }
  });
}

// Создание встроенного виджета под кнопкой
function ensureInlineWidget(btn) {
  if (!btn) return;
  const container = btn.closest('div') || btn.parentElement;
  if (!container) return;

  if (!inlineWidget || !document.contains(inlineWidget)) {
    inlineWidget = document.createElement('div');
    inlineWidget.id = 'faceit-ping-inline';
    inlineWidget.className = 'fip-inline-card';
    container.parentElement.insertBefore(inlineWidget, container.nextSibling);
  }
}

// Обновление интерфейсов HUD и виджета
function updateUi(server, pingData) {
  ensureFloatingHud();

  const hudIp = document.getElementById('fip-hud-ip');
  const hudPing = document.getElementById('fip-hud-ping');
  const hudNode = document.getElementById('fip-hud-node');
  const hudStatus = hudElement.querySelector('.fip-hud-status');

  if (!server) {
    if (hudIp) hudIp.textContent = "Ожидание сервера";
    if (hudPing) hudPing.textContent = "-- мс";
    if (hudNode) hudNode.textContent = "Голосование...";
    if (hudStatus) {
      hudStatus.textContent = "Ожидание";
      hudStatus.className = "fip-hud-status fip-status-pending";
    }
    return;
  }

  if (hudIp) hudIp.textContent = `${server.ip}:${server.port}`;

  const classification = (pingData && pingData.classification) || {};
  if (hudNode) hudNode.textContent = classification.provider || "FACEIT Server";

  if (pingData && pingData.success && pingData.ping !== undefined) {
    if (hudPing) hudPing.textContent = `${pingData.ping} мс`;

    if (pingData.ping < 65 && classification.risk !== "high") {
      hudStatus.textContent = "Стабильно";
      hudStatus.className = "fip-hud-status fip-status-good";
    } else if (pingData.ping < 120 && classification.risk !== "high") {
      hudStatus.textContent = "Средний";
      hudStatus.className = "fip-hud-status fip-status-mid";
    } else {
      hudStatus.textContent = "Высокий пинг";
      hudStatus.className = "fip-hud-status fip-status-bad";
    }
  } else {
    const est = classification.estPing || (pingData && pingData.estPing) || "~60-90 мс";
    if (hudPing) hudPing.textContent = est;

    if (classification.risk === "high") {
      hudStatus.textContent = "Риск 220+";
      hudStatus.className = "fip-hud-status fip-status-bad";
    } else {
      hudStatus.textContent = "Обычный";
      hudStatus.className = "fip-hud-status fip-status-good";
    }
  }

  // Обновление встроенного виджета, если кнопка на экране
  if (inlineWidget && document.contains(inlineWidget)) {
    inlineWidget.innerHTML = `
      <div class="fip-inline-row">
        <span class="fip-inline-title">ПИНГ СЕРВЕРА:</span>
        <span class="fip-inline-val">${hudPing.textContent}</span>
        <span class="fip-inline-tag ${hudStatus.className.replace('fip-hud-status', '')}">${hudStatus.textContent}</span>
        <span class="fip-inline-host">${hudNode.textContent}</span>
      </div>
    `;
  }
}

// Запуск измерения пинга
function runPing(ip, port) {
  const hudStatus = hudElement ? hudElement.querySelector('.fip-hud-status') : null;
  if (hudStatus) {
    hudStatus.textContent = "Замер...";
    hudStatus.className = "fip-hud-status fip-status-pending";
  }

  chrome.runtime.sendMessage({ action: "ping_server", ip: ip, port: port }, (resp) => {
    updateUi({ ip: ip, port: port }, resp);
  });
}

// Главная процедура проверки страницы
async function checkMatchAndDom() {
  ensureFloatingHud();

  // 1. Проверяем наличие кнопки на странице
  const btn = findConnectButton();
  if (btn) {
    ensureInlineWidget(btn);
  }

  // 2. Проверяем Match ID из URL
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

  // 3. Проверяем DOM
  const domServer = scanDomForServer();
  if (domServer && (domServer.ip !== currentIp || domServer.port !== currentPort)) {
    currentIp = domServer.ip;
    currentPort = domServer.port;
    runPing(currentIp, currentPort);
    return;
  }

  // 4. Проверяем сохраненное состояние
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

function findConnectButton() {
  const elements = document.querySelectorAll('button, a, div[role="button"]');
  for (const el of elements) {
    const t = (el.textContent || '').trim().toUpperCase();
    if (t.includes('ПОДКЛЮЧИТЬСЯ') || t.includes('CONNECT')) {
      return el;
    }
  }
  return null;
}

// Запуск наблюдателя
setInterval(checkMatchAndDom, 1500);
setTimeout(checkMatchAndDom, 800);
