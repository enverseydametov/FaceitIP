import sys
import json
import struct
import socket
import time
import subprocess
import re
import ipaddress

# База подсетей и классификация узлов FACEIT
SUBNET_INFO = [
    {
        "cidr": "170.168.20.0/24",
        "provider": "Castles.pro (M9)",
        "risk": "high",
        "warning": "Высокий риск (220+ мс)"
    },
    {
        "cidr": "195.208.210.0/24",
        "provider": "Castles.pro (M9-IX)",
        "risk": "high",
        "warning": "Проблемный стык MSK-IX"
    },
    {
        "cidr": "140.174.177.0/24",
        "provider": "Psychz Networks",
        "risk": "high",
        "warning": "Сбой BGP (210+ мс)"
    },
    {
        "cidr": "108.181.60.0/24",
        "provider": "Psychz Networks",
        "risk": "high",
        "warning": "Сбой BGP (210+ мс)"
    },
    {
        "cidr": "92.223.0.0/16",
        "provider": "G-Core Labs",
        "risk": "low",
        "warning": "Стабильный узел"
    },
    {
        "cidr": "169.254.133.0/24",
        "provider": "DDoS Guard / Вход",
        "risk": "low",
        "warning": "Вход дата-центра"
    }
]

def classify_ip(ip_str):
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        for entry in SUBNET_INFO:
            net = ipaddress.ip_network(entry["cidr"], strict=False)
            if ip_obj in net:
                return {
                    "provider": entry["provider"],
                    "risk": entry["risk"],
                    "warning": entry["warning"]
                }
    except Exception:
        pass
    return {
        "provider": "FACEIT Server",
        "risk": "normal",
        "warning": "Стандартный сервер"
    }

def ping_udp(ip, port, count=3):
    query = b'\xFF\xFF\xFF\xFFTSource Engine Query\x00'
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(0.35)
    rtts = []
    
    for _ in range(count):
        try:
            t0 = time.perf_counter()
            sock.sendto(query, (ip, port))
            data, _ = sock.recvfrom(2048)
            t1 = time.perf_counter()
            if data and data.startswith(b'\xFF\xFF\xFF\xFF'):
                rtts.append((t1 - t0) * 1000.0)
        except Exception:
            pass
        time.sleep(0.05)
        
    sock.close()
    if rtts:
        return {
            "success": True,
            "min_ping": round(min(rtts), 1),
            "avg_ping": round(sum(rtts) / len(rtts), 1),
            "loss": round(((count - len(rtts)) / count) * 100),
            "protocol": "UDP CS2"
        }
    return None

def ping_icmp(ip, count=2):
    try:
        cmd = ["ping", "-n", str(count), "-w", "800", ip]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        raw = proc.stdout
        txt = ""
        for enc in ["cp866", "utf-8", "cp1251", "latin1"]:
            try:
                txt = raw.decode(enc)
                break
            except Exception:
                continue
        
        avg_match = re.search(r"(?:Average|Среднее)\s*=\s*(\d+)", txt, re.IGNORECASE)
        times = re.findall(r"(?:time|время)\s*[=<]\s*(\d+)\s*(?:ms|мс)", txt, re.IGNORECASE)
        loss_match = re.search(r"\(?(\d+)%\s*(?:loss|потерь)", txt, re.IGNORECASE)
        
        loss_val = int(loss_match.group(1)) if loss_match else (0 if times else 100)
        
        if avg_match:
            avg_p = int(avg_match.group(1))
            min_p = min([int(t) for t in times]) if times else avg_p
            return {
                "success": True,
                "min_ping": min_p,
                "avg_ping": avg_p,
                "loss": loss_val,
                "protocol": "ICMP"
            }
        elif times:
            int_times = [int(t) for t in times]
            return {
                "success": True,
                "min_ping": min_p,
                "avg_ping": round(sum(int_times) / len(int_times)),
                "loss": loss_val,
                "protocol": "ICMP"
            }
        elif loss_val == 100:
            return {
                "success": False,
                "loss": 100,
                "error": "Таймаут (фильтр ICMP)",
                "protocol": "ICMP"
            }
    except Exception as e:
        return {"success": False, "error": str(e), "protocol": "ICMP"}
    
    return {"success": False, "error": "Нет отклика", "protocol": "ICMP"}

def run_quick_trace(ip):
    try:
        cmd = ["tracert", "-d", "-h", "10", "-w", "500", ip]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        raw = proc.stdout
        txt = ""
        for enc in ["cp866", "utf-8", "cp1251"]:
            try:
                txt = raw.decode(enc)
                break
            except Exception:
                continue
                
        hops = []
        for line in txt.splitlines():
            line = line.strip()
            if line and re.match(r"^\d+", line):
                hops.append(line)
        return {"success": True, "hops": hops}
    except Exception as e:
        return {"success": False, "error": str(e)}

def handle_message(msg):
    action = msg.get("action", "ping")
    ip_raw = str(msg.get("ip", "")).strip()
    port = msg.get("port", 27015)
    
    # Строгая валидация IP (защита от инъекций)
    try:
        ip_obj = ipaddress.ip_address(ip_raw)
        if ip_obj.version != 4:
            return {"success": False, "error": "Только IPv4"}
        ip = str(ip_obj)
    except Exception:
        return {"success": False, "error": "Некорректный IP"}
    
    # Строгая валидация порта
    try:
        port = int(port)
        if not (1 <= port <= 65535):
            port = 27015
    except Exception:
        port = 27015
        
    classification = classify_ip(ip)
    
    if action == "trace":
        trace_res = run_quick_trace(ip)
        return {
            "success": trace_res.get("success", False),
            "ip": ip,
            "port": port,
            "classification": classification,
            "trace": trace_res
        }
        
    # Сначала проверяем UDP игровой протокол
    udp_res = ping_udp(ip, port)
    if udp_res and udp_res["success"]:
        return {
            "success": True,
            "ip": ip,
            "port": port,
            "ping": udp_res["avg_ping"],
            "min_ping": udp_res["min_ping"],
            "loss": udp_res["loss"],
            "protocol": udp_res["protocol"],
            "classification": classification
        }
        
    # Если UDP порт еще не слушает или фильтруется, проверяем ICMP
    icmp_res = ping_icmp(ip)
    if icmp_res.get("success"):
        return {
            "success": True,
            "ip": ip,
            "port": port,
            "ping": icmp_res["avg_ping"],
            "min_ping": icmp_res["min_ping"],
            "loss": icmp_res["loss"],
            "protocol": icmp_res["protocol"],
            "classification": classification
        }
        
    return {
        "success": False,
        "ip": ip,
        "port": port,
        "loss": 100,
        "error": icmp_res.get("error", "Сервер скрывает пинг"),
        "protocol": "ICMP/UDP",
        "classification": classification
    }

def main():
    while True:
        raw_len = sys.stdin.buffer.read(4)
        if len(raw_len) < 4:
            break
        msg_len = struct.unpack('<I', raw_len)[0]
        msg_bytes = sys.stdin.buffer.read(msg_len)
        if len(msg_bytes) < msg_len:
            break
            
        try:
            msg = json.loads(msg_bytes.decode('utf-8'))
            response = handle_message(msg)
        except Exception as e:
            response = {"success": False, "error": str(e)}
            
        resp_bytes = json.dumps(response, ensure_ascii=False).encode('utf-8')
        sys.stdout.buffer.write(struct.pack('<I', len(resp_bytes)))
        sys.stdout.buffer.write(resp_bytes)
        sys.stdout.buffer.flush()

if __name__ == "__main__":
    main()
