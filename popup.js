// Логика всплывающего окна расширения
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
  const btnTraceLast = document.getElementById("btn-trace-last");
  const btnCopyIp = document.getElementById("btn-copy-ip");

  const traceBox = document.getElementById("popup-trace-box");
  const traceList = document.getElementById("popup-trace-list");
  const traceClose = document.getElementById("popup-trace-close");

  let activeIp = "";
  let activePort = 27015;

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
      const est = classification.estPing || res.estPing || "~50-90 мс";
      currentPingEl.textContent = est;
      currentLossEl.textContent = "0%";
      
      if (classification.risk === "high") {
        currentStatusEl.textContent = "Риск 220+";
        currentStatusEl.className = "val status-tag tag-bad";
      } else {
        currentStatusEl.textContent = "Обычный";
        currentStatusEl.className = "val status-tag tag-good";
      }
    }
  }

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

  function performTrace(ipStr) {
    traceBox.classList.remove("hidden");
    traceList.innerHTML = `<div class="trace-loading">Трассировка узлов...</div>`;

    chrome.runtime.sendMessage({ action: "trace_server", ip: ipStr }, (resp) => {
      if (!resp || !resp.success || !resp.hops) {
        traceList.innerHTML = `<div class="trace-err">Сбой трассировки</div>`;
        return;
      }

      let html = "";
      resp.hops.forEach(h => {
        let rttText = h.rtt >= 0 ? `${h.rtt} мс` : "*";
        let rttClass = "hop-good";
        if (h.rtt > 120) rttClass = "hop-bad";
        else if (h.rtt > 65) rttClass = "hop-mid";
        if (h.rtt === -1) rttClass = "hop-timeout";

        html += `
          <div class="trace-row">
            <span class="hop-num">${h.hop}</span>
            <span class="hop-ip">${h.ip}</span>
            <span class="hop-rtt ${rttClass}">${rttText}</span>
            <span class="hop-label">${h.label}</span>
          </div>
        `;
      });
      traceList.innerHTML = html;
    });
  }

  chrome.storage.local.get(["lastServer"], (data) => {
    if (data.lastServer) {
      const s = data.lastServer;
      renderResult(s.ip, s.port, s.result);
      manualIpInput.value = `${s.ip}:${s.port}`;
    }
  });

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

  btnRefreshLast.addEventListener("click", () => {
    if (activeIp) {
      performPing(activeIp, activePort);
    }
  });

  btnTraceLast.addEventListener("click", () => {
    if (activeIp) {
      performTrace(activeIp);
    }
  });

  traceClose.addEventListener("click", () => {
    traceBox.classList.add("hidden");
  });

  btnCopyIp.addEventListener("click", () => {
    if (activeIp) {
      navigator.clipboard.writeText(`connect ${activeIp}:${activePort}`);
      btnCopyIp.textContent = "Скопировано";
      setTimeout(() => { btnCopyIp.textContent = "Копия IP"; }, 1500);
    }
  });

  checkNativeHost();
});
