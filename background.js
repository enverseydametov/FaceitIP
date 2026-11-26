// Фоновый сервис-воркер расширения
const NATIVE_HOST = "com.faceit.ping.inspector";

// Локальная база классификации подсетей
function classifySubnet(ip) {
  if (!ip) return { provider: "Неизвестно", risk: "normal", warning: "Обычный сервер", estPing: "--" };
  
  if (ip.startsWith("170.168.20.")) {
    return { provider: "Castles.pro (M9)", risk: "high", warning: "Высокий риск (220+ мс)", estPing: "220-245 мс" };
  }
  if (ip.startsWith("195.208.210.")) {
    return { provider: "Castles.pro (M9-IX)", risk: "high", warning: "Проблемный стык MSK-IX", estPing: "215-240 мс" };
  }
  if (ip.startsWith("140.174.177.") || ip.startsWith("108.181.60.")) {
    return { provider: "Psychz Networks", risk: "high", warning: "Сбой BGP (210+ мс)", estPing: "210-235 мс" };
  }
  if (ip.startsWith("92.223.")) {
    return { provider: "G-Core Labs", risk: "low", warning: "Стабильный маршрут", estPing: "35-55 мс" };
  }
  if (ip.startsWith("169.254.133.")) {
    return { provider: "DDoS Guard", risk: "low", warning: "Вход дата-центра", estPing: "50-55 мс" };
  }
  return { provider: "FACEIT Server", risk: "normal", warning: "Стандартный узел", estPing: "~60-90 мс" };
}

// Запрос пинга через нативный хост
function queryNativePing(ip, port) {
  const classification = classifySubnet(ip);
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST,
        { action: "ping", ip: ip, port: port },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            resolve({
              success: false,
              nativeAvailable: false,
              error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "Нет отклика",
              classification: classification,
              estPing: classification.estPing
            });
          } else {
            resolve({
              ...response,
              nativeAvailable: true,
              classification: response.classification || classification
            });
          }
        }
      );
    } catch (e) {
      resolve({
        success: false,
        nativeAvailable: false,
        error: String(e),
        classification: classification,
        estPing: classification.estPing
      });
    }
  });
}

// Запрос трассировки через нативный хост
function queryNativeTrace(ip) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST,
        { action: "trace", ip: ip },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        }
      );
    } catch (e) {
      resolve({ success: false, error: String(e) });
    }
  });
}

// Обработка сообщений от интерфейса
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping_server") {
    const ip = request.ip;
    const port = request.port || 27015;
    
    queryNativePing(ip, port).then((result) => {
      chrome.storage.local.set({
        lastServer: {
          ip: ip,
          port: port,
          result: result,
          timestamp: Date.now()
        }
      });
      sendResponse(result);
    });
    return true;
  }
  
  if (request.action === "trace_server") {
    queryNativeTrace(request.ip).then((result) => {
      sendResponse(result);
    });
    return true;
  }
  
  if (request.action === "check_native_status") {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST,
        { action: "ping", ip: "92.223.103.158", port: 27029 },
        (resp) => {
          const ok = !chrome.runtime.lastError && resp && resp.success !== undefined;
          sendResponse({ connected: ok, err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null });
        }
      );
    } catch (e) {
      sendResponse({ connected: false, err: String(e) });
    }
    return true;
  }
});
