export type ConnectionProtocol =
  | "modbus-rtu"
  | "modbus-tcp"
  | "wifi-gateway"
  | "mqtt"
  | "auto";

export type InverterConnectionConfig = {
  enabled: boolean;
  protocol: ConnectionProtocol;
  manufacturer: string;
  model: string;
  address: string;
  port?: number;
  serialPort?: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: "N" | "E" | "O";
  slaveId: number;
  timeoutMs: number;
  pollingIntervalMs: number;
  gatewayUrl?: string;
  /** Legacy UI aliases kept for backwards compatibility. */
  endpoint?: string;
  refreshSeconds?: number;
};

export const defaultConnection: InverterConnectionConfig = {
  enabled: true,
  protocol: "modbus-rtu",
  manufacturer: "Felicity",
  model: "Felicity",
  address: "",
  port: 502,
  serialPort: "",
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "N",
  slaveId: 1,
  timeoutMs: 3000,
  pollingIntervalMs: 10000,
  gatewayUrl: "",
  endpoint: "",
  refreshSeconds: 10,
};

export function sanitizeConnection(input: Partial<InverterConnectionConfig>): InverterConnectionConfig {
  const n = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  return {
    ...defaultConnection,
    ...input,
    enabled: input.enabled !== false,
    manufacturer: String(input.manufacturer ?? defaultConnection.manufacturer).slice(0, 80),
    model: String(input.model ?? defaultConnection.model).slice(0, 120),
    address: String(input.address ?? "").trim().slice(0, 255),
    port: n(input.port, 502, 1, 65535),
    serialPort: String(input.serialPort ?? "").trim().slice(0, 255),
    baudRate: n(input.baudRate, 9600, 300, 921600),
    dataBits: n(input.dataBits, 8, 5, 8),
    stopBits: n(input.stopBits, 1, 1, 2),
    parity: input.parity === "E" || input.parity === "O" ? input.parity : "N",
    slaveId: n(input.slaveId, 1, 1, 247),
    timeoutMs: n(input.timeoutMs, 3000, 500, 15000),
    pollingIntervalMs: n(input.pollingIntervalMs, 10000, 2000, 300000),
    gatewayUrl: String(input.gatewayUrl ?? input.endpoint ?? "").trim().replace(/\/$/, "").slice(0, 500),
    endpoint: String(input.endpoint ?? input.gatewayUrl ?? "").trim().replace(/\/$/, "").slice(0, 500),
    refreshSeconds: n(input.refreshSeconds, 10, 2, 300),
  };
}

export const protocolLabels: Record<ConnectionProtocol, string> = {
  "modbus-rtu": "Modbus RTU / RS485",
  "modbus-tcp": "Modbus TCP",
  "wifi-gateway": "Wi‑Fi Gateway",
  mqtt: "MQTT Gateway",
  auto: "تلقائي",
};
