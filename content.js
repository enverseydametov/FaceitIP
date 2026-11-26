// Контентный скрипт для страниц FACEIT
let lastDetectedIp = null;
let lastDetectedPort = null;
let widgetElement = null;

// Поиск IP и порта сервера в DOM
function scanForServer() {
  // 1. Поиск в ссылках steam://connect
  const links = document.querySelectorAll('a[href^="steam://connect/"]');
  for (const link of links) {
    const match = link.href.match(/steam:\/\/connect\/([0-9.]+):([0-9]+)/);
    if (match) {
      return { ip: match[1], port: parseInt(match[2], 10), anchor: link };
    }
  }

  // 2. Поиск в текстовых элементах команды connect
  const allElements = document.querySelectorAll('button, div, span, input, p');
  for (const el of allElements) {
    if (el.children.length === 0 || el.tagName === 'INPUT') {
      const text = el.value || el.textContent || '';
      const match = text.match(/(?:connect\s+)?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):([0-9]{4,5})/);
      if (match) {
        return { ip: match[1], port: parseInt(match[2], 10), anchor: el };
      }
    }
  }

  return null;
}

// Создание или обновление виджета
function showPingWidget(ip, port, anchor) {
  if (lastDetectedIp === ip && lastDetectedPort === port && widgetElement && document.contains(widgetElement)) {
    return;
  }

  lastDetectedIp = ip;
  lastDetectedPort = port;

  if (widgetElement && widgetElement.parentNode) {
    widgetElement.parentNode.removeChild(widgetElement);
  }

  widgetElement = document.createElement('div');
  widgetElement.id = 'faceit-ping-badge';
  widgetElement.className = 'fip-card fip-loading';
  widgetElement.innerHTML = `
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

  // Вставка на страницу
  if (anchor && anchor.parentElement) {
    anchor.parentElement.insertBefore(widgetElement, anchor.nextSibling);
  } else {
    document.body.appendChild(widgetElement);
  }

  // Навешивание кнопок
  const btnRefresh = widgetElement.querySelector('.fip-btn-refresh');
  const btnCopy = widgetElement.querySelector('.fip-btn-copy');

  btnRefresh.addEventListener('click', () => doPing(ip, port));
  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(`connect ${ip}:${port}`);
    btnCopy.textContent = "Скопировано";
    setTimeout(() => { btnCopy.textContent = "Копировать"; }, 1500);
  });

  doPing(ip, port);
}

// Выполнение замера
function doPing(ip, port) {
  if (!widgetElement) return;

  const badge = widgetElement.querySelector('.fip-badge');
  const pingVal = widgetElement.querySelector('.fip-ping');
  const provVal = widgetElement.querySelector('.fip-provider');

  badge.className = 'fip-badge fip-pending';
  badge.textContent = 'Замер...';
  pingVal.textContent = '...';

  chrome.runtime.sendMessage({ action: "ping_server", ip: ip, port: port }, (resp) => {
    if (!resp) return;

    const classification = resp.classification || {};
    provVal.textContent = classification.provider || "FACEIT Server";

    if (resp.success && resp.ping !== undefined) {
      pingVal.textContent = `${resp.ping} мс`;
      
      if (resp.ping < 65 && classification.risk !== "high") {
        badge.className = 'fip-badge fip-good';
        badge.textContent = 'Стабильно';
      } else if (resp.ping < 120 && classification.risk !== "high") {
        badge.className = 'fip-badge fip-mid';
        badge.textContent = 'Средний';
      } else {
        badge.className = 'fip-badge fip-bad';
        badge.textContent = 'Высокий пинг';
      }
    } else {
      if (classification.risk === "high") {
        badge.className = 'fip-badge fip-bad';
        badge.textContent = 'Риск 220+';
        pingVal.textContent = 'Проблемный узел';
      } else {
        badge.className = 'fip-badge fip-mid';
        badge.textContent = 'Скрыт';
        pingVal.textContent = 'Без ответа';
      }
    }

    if (resp.nativeAvailable === false) {
      badge.className = 'fip-badge fip-warning';
      badge.textContent = 'Запустите хост';
    }
  });
}

// Наблюдатель за изменениями DOM
const observer = new MutationObserver(() => {
  const found = scanForServer();
  if (found) {
    showPingWidget(found.ip, found.port, found.anchor);
  }
});

observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true
});

// Первичный поиск
setTimeout(() => {
  const found = scanForServer();
  if (found) {
    showPingWidget(found.ip, found.port, found.anchor);
  }
}, 1000);
