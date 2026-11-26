# FACEIT Server Ping & Route Inspector

Chrome Extension (Manifest V3) + Native Companion for real-time FACEIT CS2 server latency measurement and routing diagnostics before joining the match.

Расширение для Google Chrome (Manifest V3) и нативный модуль для проверки реального пинга и диагностики маршрута до игрового сервера FACEIT CS2 перед подключением.

---

## Русский язык

### Описание
FACEIT Server Ping & Route Inspector решает критическую проблему скрытого высокого пинга и асимметричной маршрутизации в матчах FACEIT CS2. Расширение определяет выделенный сервер сразу после завершения голосования за локацию и производит замер задержки и потерь пакетов еще до запуска игры и нажатия кнопки подключения.

### Проблема, которую решает расширение
В регионе «Москва» и европейских локациях FACEIT задействует различные дата-центры и хостинг-провайдеры:
- Подсети **92.223.*.\*** (G-Core Labs) и **EdgeCenter**: обеспечивают прямой чистый маршрут с минимальным пингом (35-55 мс для игроков из РФ и Казахстана).
- Подсети **170.168.20.\*** (Castles.pro / M9 / Psychz): у ряда интернет-провайдеров (включая Казахтелеком, региональные сети РФ) трафик на финальном стыке попадает на асимметричный обратный маршрут или жесткую фильтрацию ICMP rate-limiting, из-за чего пинг подскакивает до 215-240 мс с потерей пакетов.
- Подсети Германии и Стокгольма: отдельные шлюзы (Twelve99, CTGNet) могут направлять трафик кружным путем с задержкой 200-350 мс.

Стандартные игровые утилиты и обычные браузерные расширения не способны измерить задержку CS2 сервера из песочницы браузера из-за блокировки ICMP-пакетов защитой дата-центра. Данное расширение применяет нативный модуль игровых UDP-запросов (Source Engine Query), замеряющий честный RTT игрового трафика.

### Возможности
- Автоматическое обнаружение IP и порта игрового сервера в комнате матча FACEIT (`steam://connect/`, кнопки подключения, текстовые поля).
- Встраивание компактного индикатора прямо в интерфейс матча рядом с кнопкой «Connect».
- Замер пинга по рабочему игровому протоколу UDP CS2 (A2S_INFO) без искажений анти-DDoS фильтрами.
- Резервный ICMP-пинг и расчет процента потерь пакетов (Loss %).
- Автоматическая классификация узла и оценка риска маршрута (Castles.pro, G-Core, Psychz, MSK-IX).
- Ручной замер любого IP:PORT через всплывающее меню (Popup).
- Копирование готовой строки `connect IP:PORT` в один клик.

### База классификации подсетей
| Подсеть / Хостинг | Провайдер | Оценка риска | Ожидаемая задержка |
|---|---|---|---|
| 170.168.20.0/24 | Castles.pro (M9) | Высокий риск | 215-245 мс (Казахстан/СНГ) |
| 195.208.210.0/24 | Castles.pro (M9-IX) | Высокий риск | Асимметричный BGP-стык |
| 140.174.177.0/24 | Psychz Networks | Высокий риск | 210-235 мс |
| 108.181.60.0/24 | Psychz Networks | Высокий риск | 210-235 мс |
| 92.223.0.0/16 | G-Core Labs | Низкий риск | 35-55 мс |
| 169.254.133.0/24 | DDoS Guard / Вход | Низкий риск | Входной шлюз Москвы |

### Установка и запуск

#### Шаг 1: Установка расширения в Google Chrome
1. Откройте браузер Google Chrome и перейдите по адресу: `chrome://extensions/`
2. В правом верхнем углу включите переключатель **Режим разработчика** (Developer mode).
3. Нажмите кнопку **Загрузить распакованное расширение** (Load unpacked).
4. Выберите папку с данным проектом (`FaceitIP`).

#### Шаг 2: Активация нативного модуля замера (Windows)
1. Откройте папку `native_host` внутри проекта.
2. Запустите файл `install_host.bat` двойным кликом (права администратора не требуются, запись производится в ветку текущего пользователя `HKCU`).
3. При необходимости деактивации запустите `uninstall_host.bat`.

---

## English

### Overview
FACEIT Server Ping & Route Inspector addresses the critical issue of unexpected high latency and asymmetric routing on FACEIT CS2 match servers. The extension automatically detects the allocated server IP and port as soon as the map/location voting concludes and tests latency and packet loss prior to launching the game client.

### The Problem It Solves
Within the "Moscow" and European server pools, FACEIT deploys servers across multiple data centers and hosting providers:
- Subnets **92.223.*.\*** (G-Core Labs) and **EdgeCenter**: direct routing with low latency (35-55 ms for players from CIS / Central Asia / Eastern Europe).
- Subnets **170.168.20.\*** (Castles.pro / M9 / Psychz): certain ISPs (such as Kazakhtelecom and specific Russian transit routes) face asymmetric return paths or aggressive ICMP rate-limiting at border gateways, resulting in ping spikes up to 215-240 ms with packet loss.
- European routing: routes going through Twelve99 or CTGNet may experience latency jumps between 200 and 350 ms.

Because datacenter anti-DDoS equipment frequently drops or rate-limits standard ICMP requests (showing `* * *` timeouts), browser sandboxes cannot accurately determine server responsiveness. This extension pairs with a lightweight Native Messaging Host to send genuine UDP Source Engine Query (`A2S_INFO`) packets directly to the game server port, yielding true game RTT.

### Features
- Real-time DOM observation on FACEIT matchroom pages (`faceit.com/*/cs2/room/*`).
- Non-intrusive status badge embedded next to the "Connect to Server" button.
- True game latency measurement using UDP CS2 protocol (A2S_INFO).
- Fallback ICMP measurement with packet loss percentage calculation.
- Subnet risk classifier (identifies Castles.pro, G-Core, Psychz, MSK-IX).
- Manual IP:Port ping tester in the popup window.
- One-click `connect IP:PORT` clipboard copy.

### Subnet Risk Database
| Subnet / Host | Provider | Risk Level | Expected Latency |
|---|---|---|---|
| 170.168.20.0/24 | Castles.pro (M9) | High Risk | 215-245 ms (CIS / Kazakhstan) |
| 195.208.210.0/24 | Castles.pro (M9-IX) | High Risk | Asymmetric BGP return path |
| 140.174.177.0/24 | Psychz Networks | High Risk | 210-235 ms |
| 108.181.60.0/24 | Psychz Networks | High Risk | 210-235 ms |
| 92.223.0.0/16 | G-Core Labs | Low Risk | 35-55 ms |
| 169.254.133.0/24 | DDoS Guard / Ingress | Low Risk | Clean gateway |

### Installation

#### Step 1: Install Chrome Extension
1. Open Google Chrome and navigate to: `chrome://extensions/`
2. Enable **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked** and select this repository folder (`FaceitIP`).

#### Step 2: Register Native Companion Host (Windows)
1. Open the `native_host` subfolder.
2. Run `install_host.bat` (no administrator privileges needed; writes to `HKCU`).
3. To unregister at any time, run `uninstall_host.bat`.

---

## Security & Architecture / Безопасность

- **Manifest V3**: Built using modern Chrome Extension architecture without dynamic code execution (`eval`).
- **Input Sanitization**: Strict IPv4 and integer port validation prevents command injection.
- **Fixed Extension Key**: The manifest includes a predefined RSA public key ensuring a permanent extension ID (`kdhmjiinfceafbkbinohpcefneedhjjo`) matching the native host permissions.
- **Privacy**: No telemetry, no third-party tracking, requests strictly routed between the user machine and the target game server.

---

## Keywords / Ключевые слова
`faceit-ping` `faceit-server-ip` `cs2-latency` `faceit-enhancer` `castles-pro` `g-core-labs` `faceit-moscow-ping` `kazakhtelecom-routing` `packet-loss` `source-engine-query` `a2s-info` `chrome-extension` `manifest-v3` `пинг-фейсит` `трассировка-faceit`
