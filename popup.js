// Логика интерфейса всплывающего окна
document.addEventListener("DOMContentLoaded", () => {
  const hostStatusEl = document.getElementById("host-status");
  const currentIpEl = document.getElementById("current-ip");
  const currentProvEl = document.getElementById("current-provider");
  const currentPingEl = document.getElementById("current-ping");
  const currentLossEl = document.getElementById("current-loss");
  const currentStatusEl = document.getElementById("current-status");

  const manualIpInput = document.getElementById("manual-ip");
  const btnManualCheck = document.getElementById("btn-manual-check");
  const btnRefreshLast = document.getElementById("btn-refresh-last");
  const btnCopyIp = document.getElementById("btn-copy-ip");

  let activeIp = "";
  let activePort = 27015;

  // Проверка статуса нативного хоста
  function checkNativeHost() {
    chrome.runtime.sendMessage({ action: "check_native_status" }, (res) => {
      if (res && res.connected) {
        hostStatusEl.textContent = "Хост активен";
        hostStatusEl.className = "status-indicator online";
      } else {
        hostStatusEl.textContent = "Ожидание службы";
        hostStatusEl.className = "status-indicator offline";
      }
    });
  }

  // Обновление отображения результатов
  function renderResult(ip, port, res) {
    if (!ip) return;
    activeIp = ip;
    activePort = port;
    currentIpEl.textContent = `${ip}:${port}`;

    const classification = res.classification || {};
    currentProvEl.textContent = classification.provider || "FACEIT Server";

    if (res.success && res.ping !== undefined) {
      currentPingEl.textContent = `${res.ping} мс`;
      currentLossEl.textContent = `${res.loss || 0}%`;

      if (res.ping < 65 && classification.risk !== "high") {
        currentStatusEl.textContent = "Стабильно";
        currentStatusEl.className = "val status-tag tag-good";
      } else if (res.ping < 120 && classification.risk !== "high") {
        currentStatusEl.textContent = "Средний";
        currentStatusEl.className = "val status-tag tag-mid";
      } else {
        currentStatusEl.textContent = "Высокий пинг";
        currentStatusEl.className = "val status-tag tag-bad";
      }
    } else {
      // Расчетное значение по подсети
      const est = classification.estPing || res.estPing || "~60-90 мс";
      currentPingEl.textContent = est;
      currentLossEl.textContent = "0%";
      
      if (classification.risk === "high") {
        currentStatusEl.textContent = "Риск 220+";
        currentStatusEl.className = "val status-tag tag-bad";
      } else if (classification.risk === "low") {
        currentStatusEl.textContent = "Стабильно";
        currentStatusEl.className = "val status-tag tag-good";
      } else {
        currentStatusEl.textContent = "Обычный";
        currentStatusEl.className = "val status-tag tag-mid";
      }
    }
  }

  // Запуск проверки IP
  function performPing(ipStr, portVal) {
    currentStatusEl.textContent = "Замер...";
    currentStatusEl.className = "val status-tag tag-pending";

    chrome.runtime.sendMessage(
      { action: "ping_server", ip: ipStr, port: portVal },
      (res) => {
        renderResult(ipStr, portVal, res);
        checkNativeHost();
      }
    );
  }

  // Загрузка сохраненного состояния
  chrome.storage.local.get(["lastServer"], (data) => {
    if (data.lastServer) {
      const s = data.lastServer;
      renderResult(s.ip, s.port, s.result);
      manualIpInput.value = `${s.ip}:${s.port}`;
    }
  });

  // Кнопка ручной проверки
  btnManualCheck.addEventListener("click", () => {
    const raw = manualIpInput.value.trim();
    if (!raw) return;

    let ip = raw;
    let port = 27015;

    if (raw.includes(":")) {
      const parts = raw.split(":");
      ip = parts[0].trim();
      port = parseInt(parts[1], 10) || 27015;
    }

    performPing(ip, port);
  });

  // Кнопка повторного замера
  btnRefreshLast.addEventListener("click", () => {
    if (activeIp) {
      performPing(activeIp, activePort);
    }
  });

  // Кнопка копирования
  btnCopyIp.addEventListener("click", () => {
    if (activeIp) {
      navigator.clipboard.writeText(`connect ${activeIp}:${activePort}`);
      btnCopyIp.textContent = "Скопировано";
      setTimeout(() => { btnCopyIp.textContent = "Копировать IP"; }, 1500);
    }
  });

  // Клик по статусу для повторной проверки
  hostStatusEl.addEventListener("click", () => {
    checkNativeHost();
  });

  checkNativeHost();
});
