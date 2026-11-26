// Контентный скрипт FACEIT Ping Inspector
let lastIp = null;
let lastPort = null;
let currentWidget = null;

// Поиск кнопки подключения на странице
function findConnectButton() {
  // 1. Поиск по тексту кнопки
  const candidates = document.querySelectorAll('button, a, div[role="button"]');
  for (const el of candidates) {
    const txt = (el.textContent || '').trim().toUpperCase();
    if (txt.includes('ПОДКЛЮЧИТЬСЯ К СЕРВЕРУ') || txt.includes('CONNECT TO SERVER') || txt === 'ПОДКЛЮЧИТЬСЯ' || txt === 'CONNECT') {
      return el;
    }
  }

  // 2. Поиск по ссылкам steam://connect
  const steamLink = document.querySelector('a[href^="steam://connect/"]');
  if (steamLink) return steamLink;

  // 3. Поиск блока времени до подключения
  const timeHeaders = document.querySelectorAll('div, span, p');
  for (const el of timeHeaders) {
    const txt = (el.textContent || '').trim();
    if (txt.includes('Время для подключения') || txt.includes('Time to connect')) {
      const parent = el.closest('div');
      if (parent) {
        const btn = parent.querySelector('button, a');
        if (btn) return btn;
      }
    }
  }

  return null;
}

// Глубокий поиск IP и порта в объектах React Props
function findIpInReactProps(domEl) {
  if (!domEl) return null;
  try {
    const keys = Object.keys(domEl);
    for (const k of keys) {
      if (k.startsWith('__reactFiber') || k.startsWith('__reactProps')) {
        const prop = domEl[k];
        const res = searchObjForIp(prop, 0);
        if (res) return res;
      }
    }
  } catch (e) {
  }
  return null;
}

function searchObjForIp(obj, depth) {
  if (!obj || depth > 4 || typeof obj !== 'object') return null;
  try {
    if (obj.server && typeof obj.server === 'object') {
      const ip = obj.server.ip || obj.server.serverIp;
      const port = obj.server.port || obj.server.serverPort || 27015;
      if (ip && typeof ip === 'string' && ip.includes('.')) {
        return { ip: ip, port: parseInt(port, 10) || 27015 };
      }
    }
    if (typeof obj.ip === 'string' && /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(obj.ip)) {
      const port = parseInt(obj.port || 27015, 10);
      return { ip: obj.ip, port: port };
    }
    for (const key of Object.keys(obj)) {
      if (key === 'children' || key === 'parent' || key === 'stateNode') continue;
      const val = obj[key];
      if (typeof val === 'string') {
        const match = val.match(/(?:connect\s+)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/i);
        if (match) {
          return { ip: match[1], port: parseInt(match[2], 10) };
        }
      } else if (typeof val === 'object' && val !== null) {
        const sub = searchObjForIp(val, depth + 1);
        if (sub) return sub;
      }
    }
  } catch (e) {
  }
  return null;
}

// Поиск IP и порта по всему DOM
function extractServerFromDOM() {
  // 1. Поиск ссылок steam://connect
  const steamLinks = document.querySelectorAll('a[href^="steam://connect/"]');
  for (const a of steamLinks) {
    const match = a.href.match(/steam:\/\/connect\/([0-9.]+):([0-9]+)/);
    if (match) {
      return { ip: match[1], port: parseInt(match[2], 10) };
    }
  }

  // 2. Поиск по атрибутам клипборда и data-атрибутам
  const attrElements = document.querySelectorAll('[data-clipboard-text], [data-ip], [data-value], [value], [title], [aria-label]');
  for (const el of attrElements) {
    const val = el.getAttribute('data-clipboard-text') || el.getAttribute('data-ip') || el.value || el.title || el.getAttribute('aria-label') || '';
    const match = val.match(/(?:connect\s+)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/i);
    if (match) {
      return { ip: match[1], port: parseInt(match[2], 10) };
    }
  }

  // 3. Поиск по текстовым нодам в теле страницы
  const bodyText = document.body ? document.body.innerText : '';
  const textMatch = bodyText.match(/(?:connect\s+)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/i);
  if (textMatch) {
    return { ip: textMatch[1], port: parseInt(textMatch[2], 10) };
  }

  return null;
}

// Вставка или обновление виджета
function injectOrUpdateWidget() {
  const btn = findConnectButton();
  if (!btn) return;

  // Ищем IP
  let serverData = extractServerFromDOM();
  if (!serverData) {
    serverData = findIpInReactProps(btn);
  }

  // Находим контейнер для вставки (родитель кнопки или сама строка кнопок)
  const container = btn.closest('div') || btn.parentElement;
  if (!container) return;

  if (!currentWidget || !document.contains(currentWidget)) {
    currentWidget = document.createElement('div');
    currentWidget.id = 'faceit-ping-badge';
    currentWidget.className = 'fip-card';

    // Вставляем строго под контейнером кнопки подключения
    if (container.parentElement) {
      container.parentElement.insertBefore(currentWidget, container.nextSibling);
    } else {
      container.appendChild(currentWidget);
    }
  }

  if (serverData && (serverData.ip !== lastIp || serverData.port !== lastPort)) {
    lastIp = serverData.ip;
    lastPort = serverData.port;
    renderWidgetContent(lastIp, lastPort);
    triggerPing(lastIp, lastPort);
  } else if (!serverData && !lastIp) {
    // Если кнопка подключения есть, но IP скрыт в меню стрелки
    renderPendingWidget(btn);
  }
}

// Отрисовка состояния ожидания IP
function renderPendingWidget(btn) {
  if (!currentWidget) return;
  currentWidget.innerHTML = `
    <div class="fip-header">
      <span class="fip-title">Пинг сервера</span>
      <span class="fip-badge fip-pending">Поиск IP...</span>
    </div>
    <div class="fip-body">
      <div class="fip-row">
        <span class="fip-label">Сервер:</span>
        <span class="fip-val">Нажмите стрелку v</span>
      </div>
      <div class="fip-row">
        <span class="fip-label">Задержка:</span>
        <span class="fip-val fip-ping">-- мс</span>
      </div>
    </div>
    <div class="fip-footer">
      <button class="fip-btn fip-btn-refresh">Считать IP</button>
    </div>
  `;

  const btnScan = currentWidget.querySelector('.fip-btn-refresh');
  if (btnScan) {
    btnScan.addEventListener('click', () => {
      // Пытаемся симулировать клик по стрелке или пересканировать
      const parent = btn.parentElement;
      if (parent) {
        const arrow = parent.querySelector('button:last-child');
        if (arrow && arrow !== btn) {
          arrow.click();
          setTimeout(() => {
            const found = extractServerFromDOM();
            if (found) {
              lastIp = found.ip;
              lastPort = found.port;
              renderWidgetContent(lastIp, lastPort);
              triggerPing(lastIp, lastPort);
            }
          }, 150);
        }
      }
    });
  }
}

// Отрисовка карточки с IP
function renderWidgetContent(ip, port) {
  if (!currentWidget) return;
  currentWidget.innerHTML = `
    <div class="fip-header">
      <span class="fip-title">Пинг сервера</span>
      <span class="fip-badge fip-pending">Замер...</span>
    </div>
    <div class="fip-body">
      <div class="fip-row">
        <span class="fip-label">Сервер:</span>
        <span class="fip-val">${ip}:${port}</span>
      </div>
      <div class="fip-row">
        <span class="fip-label">Узел:</span>
        <span class="fip-val fip-provider">Определение...</span>
      </div>
      <div class="fip-row">
        <span class="fip-label">Задержка:</span>
        <span class="fip-val fip-ping">-- мс</span>
      </div>
    </div>
    <div class="fip-footer">
      <button class="fip-btn fip-btn-refresh">Обновить</button>
      <button class="fip-btn fip-btn-copy">Копировать</button>
    </div>
  `;

  const btnRefresh = currentWidget.querySelector('.fip-btn-refresh');
  const btnCopy = currentWidget.querySelector('.fip-btn-copy');

  btnRefresh.addEventListener('click', () => triggerPing(ip, port));
  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(`connect ${ip}:${port}`);
    btnCopy.textContent = "Скопировано";
    setTimeout(() => { btnCopy.textContent = "Копировать"; }, 1500);
  });
}

// Запуск пинга через background.js
function triggerPing(ip, port) {
  if (!currentWidget) return;

  const badge = currentWidget.querySelector('.fip-badge');
  const pingVal = currentWidget.querySelector('.fip-ping');
  const provVal = currentWidget.querySelector('.fip-provider');

  if (badge) {
    badge.className = 'fip-badge fip-pending';
    badge.textContent = 'Замер...';
  }
  if (pingVal) pingVal.textContent = '...';

  chrome.runtime.sendMessage({ action: "ping_server", ip: ip, port: port }, (resp) => {
    if (!resp || !currentWidget) return;

    const classification = resp.classification || {};
    if (provVal) provVal.textContent = classification.provider || "FACEIT Server";

    if (resp.success && resp.ping !== undefined) {
      if (pingVal) pingVal.textContent = `${resp.ping} мс`;

      if (resp.ping < 65 && classification.risk !== "high") {
        if (badge) {
          badge.className = 'fip-badge fip-good';
          badge.textContent = 'Стабильно';
        }
      } else if (resp.ping < 120 && classification.risk !== "high") {
        if (badge) {
          badge.className = 'fip-badge fip-mid';
          badge.textContent = 'Средний';
        }
      } else {
        if (badge) {
          badge.className = 'fip-badge fip-bad';
          badge.textContent = 'Высокий пинг';
        }
      }
    } else {
      const est = classification.estPing || resp.estPing || "~60-90 мс";
      if (pingVal) pingVal.textContent = est;

      if (classification.risk === "high") {
        if (badge) {
          badge.className = 'fip-badge fip-bad';
          badge.textContent = 'Риск 220+';
        }
      } else {
        if (badge) {
          badge.className = 'fip-badge fip-mid';
          badge.textContent = 'Обычный';
        }
      }
    }
  });
}

// Автоподгрузка последнего сохраненного сервера
chrome.storage.local.get(["lastServer"], (data) => {
  if (data.lastServer && !lastIp) {
    const s = data.lastServer;
    // Если матч был недавно (менее 1 часа назад)
    if (Date.now() - (s.timestamp || 0) < 3600000) {
      lastIp = s.ip;
      lastPort = s.port;
      injectOrUpdateWidget();
    }
  }
});

// Наблюдатель за DOM
const obs = new MutationObserver(() => {
  injectOrUpdateWidget();
});

obs.observe(document.documentElement, {
  childList: true,
  subtree: true
});

// Периодическая проверка раз в 1.5 секунды
setInterval(injectOrUpdateWidget, 1500);
