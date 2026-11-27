using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;

namespace FaceitPingHost
{
    class Program
    {
        static void Main(string[] args)
        {
            try
            {
                using (BinaryReader reader = new BinaryReader(Console.OpenStandardInput()))
                using (BinaryWriter writer = new BinaryWriter(Console.OpenStandardOutput()))
                {
                    while (true)
                    {
                        if (reader.BaseStream.Read(new byte[0], 0, 0) < 0)
                            break;

                        int length;
                        try
                        {
                            length = reader.ReadInt32();
                        }
                        catch (EndOfStreamException)
                        {
                            break;
                        }

                        if (length <= 0 || length > 1024 * 1024)
                            break;

                        byte[] buffer = reader.ReadBytes(length);
                        if (buffer.Length < length)
                            break;

                        string jsonMsg = Encoding.UTF8.GetString(buffer);
                        string responseJson = ProcessMessage(jsonMsg);

                        byte[] respBytes = Encoding.UTF8.GetBytes(responseJson);
                        writer.Write(respBytes.Length);
                        writer.Write(respBytes);
                        writer.Flush();
                    }
                }
            }
            catch
            {
            }
        }

        static string ProcessMessage(string json)
        {
            string ipStr = "";
            int port = 27015;
            string action = "ping";

            Match mIp = Regex.Match(json, "\"ip\"\\s*:\\s*\"([^\"]+)\"");
            if (mIp.Success) ipStr = mIp.Groups[1].Value.Trim();

            Match mPort = Regex.Match(json, "\"port\"\\s*:\\s*([0-9]+)");
            if (mPort.Success) int.TryParse(mPort.Groups[1].Value, out port);

            Match mAction = Regex.Match(json, "\"action\"\\s*:\\s*\"([^\"]+)\"");
            if (mAction.Success) action = mAction.Groups[1].Value.Trim().ToLower();

            // Очистка от порта, если передан в строке ip (например "92.223.103.98:27033")
            if (ipStr.Contains(":"))
            {
                string[] parts = ipStr.Split(':');
                ipStr = parts[0].Trim();
                if (parts.Length > 1)
                {
                    int parsedPort;
                    if (int.TryParse(parts[1].Trim(), out parsedPort) && parsedPort > 0)
                    {
                        port = parsedPort;
                    }
                }
            }

            IPAddress ip;
            if (!IPAddress.TryParse(ipStr, out ip) || ip.AddressFamily != AddressFamily.InterNetwork)
            {
                return "{\"success\":false,\"error\":\"Некорректный IP адрес\"}";
            }

            // Классификация подсети
            string provider = "FACEIT Server";
            string risk = "normal";
            string warning = "Стандартный узел";
            string estPing = "~50-90 мс";

            if (ipStr.StartsWith("170.168.20."))
            {
                provider = "Castles.pro (M9)";
                risk = "high";
                warning = "Высокий риск (220+ мс)";
                estPing = "220-245 мс";
            }
            else if (ipStr.StartsWith("195.208.210."))
            {
                provider = "Castles.pro (M9-IX)";
                risk = "high";
                warning = "Проблемный стык MSK-IX";
                estPing = "215-240 мс";
            }
            else if (ipStr.StartsWith("140.174.177.") || ipStr.StartsWith("108.181.60."))
            {
                provider = "Psychz Networks";
                risk = "high";
                warning = "Сбой BGP (210+ мс)";
                estPing = "210-235 мс";
            }
            else if (ipStr.StartsWith("92.223."))
            {
                provider = "G-Core Labs";
                risk = "low";
                warning = "Стабильный маршрут";
                estPing = "35-55 мс";
            }
            else if (ipStr.StartsWith("169.254.133."))
            {
                provider = "DDoS Guard";
                risk = "low";
                warning = "Вход дата-центра";
                estPing = "50-55 мс";
            }

            // Трассировка
            if (action == "trace")
            {
                string traceHopsJson = MeasureTrace(ip);
                return string.Format(
                    "{{\"success\":true,\"action\":\"trace\",\"ip\":\"{0}\",\"port\":{1},\"hops\":{2},\"classification\":{{\"provider\":\"{3}\",\"risk\":\"{4}\",\"warning\":\"{5}\",\"estPing\":\"{6}\"}}}}",
                    ipStr, port, traceHopsJson, provider, risk, warning, estPing
                );
            }

            // Замер UDP CS2
            int? udpPing = MeasureUdp(ip, port);
            if (udpPing.HasValue)
            {
                return string.Format(
                    "{{\"success\":true,\"action\":\"ping\",\"ip\":\"{0}\",\"port\":{1},\"ping\":{2},\"loss\":0,\"protocol\":\"UDP CS2\",\"classification\":{{\"provider\":\"{3}\",\"risk\":\"{4}\",\"warning\":\"{5}\",\"estPing\":\"{6}\"}}}}",
                    ipStr, port, udpPing.Value, provider, risk, warning, estPing
                );
            }

            // Замер ICMP
            int? icmpPing = MeasureIcmp(ip);
            if (icmpPing.HasValue)
            {
                return string.Format(
                    "{{\"success\":true,\"action\":\"ping\",\"ip\":\"{0}\",\"port\":{1},\"ping\":{2},\"loss\":0,\"protocol\":\"ICMP\",\"classification\":{{\"provider\":\"{3}\",\"risk\":\"{4}\",\"warning\":\"{5}\",\"estPing\":\"{6}\"}}}}",
                    ipStr, port, icmpPing.Value, provider, risk, warning, estPing
                );
            }

            // Если скрыт
            return string.Format(
                "{{\"success\":false,\"action\":\"ping\",\"ip\":\"{0}\",\"port\":{1},\"loss\":100,\"error\":\"Скрыт фильтрами\",\"estPing\":\"{2}\",\"classification\":{{\"provider\":\"{3}\",\"risk\":\"{4}\",\"warning\":\"{5}\",\"estPing\":\"{2}\"}}}}",
                ipStr, port, estPing, provider, risk, warning
            );
        }

        static int? MeasureUdp(IPAddress ip, int port)
        {
            try
            {
                byte[] query = new byte[] {
                    0xFF, 0xFF, 0xFF, 0xFF, 0x54, 0x53, 0x6F, 0x75, 0x72, 0x63, 0x65,
                    0x20, 0x45, 0x6E, 0x67, 0x69, 0x6E, 0x65, 0x20, 0x51, 0x75, 0x65,
                    0x72, 0x79, 0x00
                };

                using (UdpClient client = new UdpClient())
                {
                    client.Client.ReceiveTimeout = 350;
                    client.Client.SendTimeout = 350;
                    IPEndPoint remoteEP = new IPEndPoint(ip, port);

                    Stopwatch sw = Stopwatch.StartNew();
                    client.Send(query, query.Length, remoteEP);

                    IPEndPoint recvEP = new IPEndPoint(IPAddress.Any, 0);
                    byte[] response = client.Receive(ref recvEP);
                    sw.Stop();

                    if (response != null && response.Length >= 4 && response[0] == 0xFF)
                    {
                        return (int)sw.ElapsedMilliseconds;
                    }
                }
            }
            catch
            {
            }
            return null;
        }

        static int? MeasureIcmp(IPAddress ip)
        {
            try
            {
                using (Ping ping = new Ping())
                {
                    PingReply reply = ping.Send(ip, 650);
                    if (reply.Status == IPStatus.Success)
                    {
                        return (int)reply.RoundtripTime;
                    }
                }
            }
            catch
            {
            }
            return null;
        }

        static string MeasureTrace(IPAddress targetIp)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("[");
            byte[] buffer = new byte[32];

            int maxHops = 12;
            bool first = true;
            int consecutiveTimeouts = 0;

            for (int ttl = 1; ttl <= maxHops; ttl++)
            {
                string hopIp = "*";
                long rtt = -1;

                try
                {
                    using (Ping ping = new Ping())
                    {
                        PingOptions options = new PingOptions(ttl, true);
                        Stopwatch sw = Stopwatch.StartNew();
                        PingReply reply = ping.Send(targetIp, 350, buffer, options);
                        sw.Stop();

                        if (reply.Address != null)
                        {
                            hopIp = reply.Address.ToString();
                        }

                        if (reply.Status == IPStatus.Success || reply.Status == IPStatus.TtlExpired)
                        {
                            rtt = sw.ElapsedMilliseconds;
                            consecutiveTimeouts = 0;
                        }
                        else
                        {
                            consecutiveTimeouts++;
                        }
                    }
                }
                catch
                {
                    consecutiveTimeouts++;
                }

                string label = IdentifyHop(hopIp, ttl);

                if (!first) sb.Append(",");
                first = false;

                sb.Append(string.Format(
                    "{{\"hop\":{0},\"ip\":\"{1}\",\"rtt\":{2},\"label\":\"{3}\"}}",
                    ttl, hopIp, rtt, label
                ));

                // Если достигли цели
                if (hopIp == targetIp.ToString())
                    break;

                // Если 3 таймаута подряд в конце (защита от DDoS блокирует ICMP на финале)
                if (ttl >= 7 && consecutiveTimeouts >= 3)
                    break;
            }

            sb.Append("]");
            return sb.ToString();
        }

        static string IdentifyHop(string ip, int hopIndex)
        {
            if (ip == "*") return "Фильтр ICMP";
            if (ip.StartsWith("192.168.") || ip.StartsWith("10.") || ip.StartsWith("172.16.")) return "Домашний роутер";
            if (ip.StartsWith("5.251.") || ip.StartsWith("82.200.") || ip.StartsWith("95.59.") || ip.StartsWith("92.47.")) return "Казахтелеком";
            if (ip.StartsWith("188.254.") || ip.StartsWith("188.128.")) return "Стык РФ";
            if (ip.StartsWith("195.208.215.")) return "Точка MSK-IX";
            if (ip.StartsWith("195.208.210.")) return "Castles.pro M9";
            if (ip.StartsWith("169.254.")) return "Шлюз Дата-центра";
            if (ip.StartsWith("92.223.")) return "G-Core Labs";
            if (ip.StartsWith("170.168.20.")) return "Castles.pro";

            if (hopIndex <= 2) return "Локальная сеть";
            if (hopIndex <= 5) return "Магистраль провайдера";
            if (hopIndex <= 8) return "Транзитный узел";
            return "Игровой узел";
        }
    }
}
