using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;

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
                // Тихое завершение при закрытии пайпа Chrome
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
            if (mAction.Success) action = mAction.Groups[1].Value.Trim();

            IPAddress ip;
            if (!IPAddress.TryParse(ipStr, out ip) || ip.AddressFamily != AddressFamily.InterNetwork)
            {
                return "{\"success\":false,\"error\":\"Некорректный IP\"}";
            }

            // Классификация подсети
            string provider = "FACEIT Server";
            string risk = "normal";
            string warning = "Стандартный узел";
            string estPing = "~60-90 мс";

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

            // Замер UDP CS2
            int? udpPing = MeasureUdp(ip, port);
            if (udpPing.HasValue)
            {
                return string.Format(
                    "{{\"success\":true,\"ip\":\"{0}\",\"port\":{1},\"ping\":{2},\"loss\":0,\"protocol\":\"UDP CS2\",\"classification\":{{\"provider\":\"{3}\",\"risk\":\"{4}\",\"warning\":\"{5}\",\"estPing\":\"{6}\"}}}}",
                    ipStr, port, udpPing.Value, provider, risk, warning, estPing
                );
            }

            // Замер ICMP
            int? icmpPing = MeasureIcmp(ip);
            if (icmpPing.HasValue)
            {
                return string.Format(
                    "{{\"success\":true,\"ip\":\"{0}\",\"port\":{1},\"ping\":{2},\"loss\":0,\"protocol\":\"ICMP\",\"classification\":{{\"provider\":\"{3}\",\"risk\":\"{4}\",\"warning\":\"{5}\",\"estPing\":\"{6}\"}}}}",
                    ipStr, port, icmpPing.Value, provider, risk, warning, estPing
                );
            }

            // Если оба скрыты фильтрами
            return string.Format(
                "{{\"success\":false,\"ip\":\"{0}\",\"port\":{1},\"loss\":100,\"error\":\"Скрыт фильтрами\",\"estPing\":\"{2}\",\"classification\":{{\"provider\":\"{3}\",\"risk\":\"{4}\",\"warning\":\"{5}\",\"estPing\":\"{2}\"}}}}",
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
                    client.Client.ReceiveTimeout = 400;
                    client.Client.SendTimeout = 400;
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
                    PingReply reply = ping.Send(ip, 700);
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
    }
}
