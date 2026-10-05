import asyncio
import os
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Solar Gateway", version="0.5.0")

TOKEN = os.getenv("GATEWAY_TOKEN", "")
DEFAULT_SERIAL_PORT = os.getenv("INVERTER_SERIAL_PORT", "")
DEFAULT_BAUDRATE = int(os.getenv("INVERTER_BAUDRATE", "2400"))
DEFAULT_TIMEOUT_MS = int(os.getenv("INVERTER_TIMEOUT_MS", "2000"))
POLL_INTERVAL_SECONDS = max(5, int(os.getenv("INVERTER_POLL_INTERVAL_SECONDS", "10")))
DB_PATH = os.getenv("SOLAR_GATEWAY_DB", "solar_gateway.sqlite3")

DEVICE = {
    "manufacturer": "Voltronic Power",
    "model": "Axpert MAX 7200-48-230",
    "ratedPowerW": 7200,
    "ratedPowerVA": 7200,
    "surgePowerVA": 15000,
    "batteryNominalVoltageV": 48,
    "acOutputVoltageV": 230,
    "maxPvPowerW": 8000,
    "maxPvVoltageV": 500,
    "mpptOperatingRangeV": {"min": 90, "max": 450},
    "communications": ["USB", "RS232", "RS485", "Wi-Fi"],
    "serialNumber": "92932009104508",
    "protocol": "PI30",
    "firmwareReportedByUser": "69.70",
}

latest = {
    "timestamp": "",
    "source": "none",
    "solarPowerW": None,
    "solarPowerPv1W": None,
    "solarPowerPv2W": None,
    "loadPowerW": None,
    "loadPercent": None,
    "batteryPowerW": None,
    "batterySoc": None,
    "batteryVoltageV": None,
    "batteryCurrentA": None,
    "batteryChargeCurrentA": None,
    "gridPowerW": None,
    "gridVoltageV": None,
    "gridFrequencyHz": None,
    "pvVoltageV": None,
    "pvCurrentA": None,
    "pv2VoltageV": None,
    "pv2CurrentA": None,
    "outputVoltageV": None,
    "outputFrequencyHz": None,
    "outputApparentPowerVA": None,
    "inverterTemperatureC": None,
    "inverterState": None,
    "faultCode": None,
    "warnings": [],
    "alarms": [],
    "raw": {},
}


class ConnectionTestRequest(BaseModel):
    transport: str = "pi30_serial"
    serial_port: str | None = None
    baudrate: int = Field(default=2400, ge=300, le=115200)
    timeout_ms: int = Field(default=2000, ge=200, le=10000)


class RefreshRequest(BaseModel):
    serial_port: str | None = None
    baudrate: int = Field(default=2400, ge=300, le=115200)
    timeout_ms: int = Field(default=2000, ge=200, le=10000)


def auth(token: str | None) -> None:
    if not TOKEN:
        raise HTTPException(503, "Gateway token is not configured")
    if token != TOKEN:
        raise HTTPException(401, "Invalid gateway token")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """CREATE TABLE IF NOT EXISTS telemetry_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            solar_power_w REAL,
            load_power_w REAL,
            battery_power_w REAL,
            battery_soc REAL,
            battery_voltage_v REAL,
            battery_current_a REAL,
            grid_power_w REAL,
            pv_voltage_v REAL,
            pv_current_a REAL,
            output_voltage_v REAL,
            output_frequency_hz REAL,
            inverter_temperature_c REAL,
            inverter_state TEXT,
            warnings TEXT NOT NULL DEFAULT '',
            alarms TEXT NOT NULL DEFAULT ''
        )"""
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_history_timestamp ON telemetry_history(timestamp)")
    connection.commit()
    return connection


def save_history(data: dict[str, Any]) -> None:
    with db() as connection:
        connection.execute(
            """INSERT INTO telemetry_history (
                timestamp, solar_power_w, load_power_w, battery_power_w, battery_soc,
                battery_voltage_v, battery_current_a, grid_power_w, pv_voltage_v,
                pv_current_a, output_voltage_v, output_frequency_hz,
                inverter_temperature_c, inverter_state, warnings, alarms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.get("timestamp"), data.get("solarPowerW"), data.get("loadPowerW"),
                data.get("batteryPowerW"), data.get("batterySoc"), data.get("batteryVoltageV"),
                data.get("batteryCurrentA"), data.get("gridPowerW"), data.get("pvVoltageV"),
                data.get("pvCurrentA"), data.get("outputVoltageV"), data.get("outputFrequencyHz"),
                data.get("inverterTemperatureC"), data.get("inverterState"),
                ",".join(data.get("warnings", [])), ",".join(data.get("alarms", [])),
            ),
        )
        connection.execute(
            "DELETE FROM telemetry_history WHERE id NOT IN (SELECT id FROM telemetry_history ORDER BY id DESC LIMIT 100000)"
        )
        connection.commit()


def read_history(hours: int = 24, limit: int = 5000) -> list[dict[str, Any]]:
    hours = min(max(hours, 1), 720)
    limit = min(max(limit, 1), 10000)
    with db() as connection:
        rows = connection.execute(
            """SELECT timestamp, solar_power_w, load_power_w, battery_power_w,
                      battery_soc, battery_voltage_v, battery_current_a, grid_power_w,
                      pv_voltage_v, pv_current_a, output_voltage_v, output_frequency_hz,
                      inverter_temperature_c, inverter_state, warnings, alarms
               FROM telemetry_history
              WHERE timestamp >= datetime('now', ?)
              ORDER BY timestamp ASC LIMIT ?""",
            (f"-{hours} hours", limit),
        ).fetchall()
    return [
        {
            "timestamp": row["timestamp"],
            "solarPowerW": row["solar_power_w"],
            "loadPowerW": row["load_power_w"],
            "batteryPowerW": row["battery_power_w"],
            "batterySoc": row["battery_soc"],
            "batteryVoltageV": row["battery_voltage_v"],
            "batteryCurrentA": row["battery_current_a"],
            "gridPowerW": row["grid_power_w"],
            "pvVoltageV": row["pv_voltage_v"],
            "pvCurrentA": row["pv_current_a"],
            "outputVoltageV": row["output_voltage_v"],
            "outputFrequencyHz": row["output_frequency_hz"],
            "inverterTemperatureC": row["inverter_temperature_c"],
            "inverterState": row["inverter_state"],
            "warnings": [x for x in row["warnings"].split(",") if x],
            "alarms": [x for x in row["alarms"].split(",") if x],
        }
        for row in rows
    ]


def crc16_xmodem(payload: bytes) -> int:
    crc = 0
    for byte in payload:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def frame(command: str) -> bytes:
    payload = command.encode("ascii")
    crc = crc16_xmodem(payload)
    return payload + crc.to_bytes(2, "big") + b"\r"


def validate_response(command: str, response: bytes) -> bytes:
    if not response:
        raise RuntimeError(f"No response to {command}")
    if not response.endswith(b"\r"):
        raise RuntimeError("Incomplete PI30 response")
    body = response[:-1]
    if len(body) < 3:
        raise RuntimeError("PI30 response too short")
    payload, received_crc = body[:-2], int.from_bytes(body[-2:], "big")
    expected_crc = crc16_xmodem(payload)
    if received_crc != expected_crc:
        raise RuntimeError("PI30 CRC mismatch")
    if not payload.startswith(b"("):
        raise RuntimeError("Invalid PI30 response header")
    return payload


def serial_query(port_name: str, baudrate: int, timeout_ms: int, command: str) -> bytes:
    try:
        import serial
    except ImportError as exc:
        raise RuntimeError("pyserial is not installed") from exc
    timeout = max(timeout_ms, 200) / 1000
    with serial.Serial(
        port=port_name, baudrate=baudrate, bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE, stopbits=serial.STOPBITS_ONE,
        timeout=timeout, write_timeout=timeout, rtscts=False, dsrdtr=False,
    ) as port:
        port.reset_input_buffer()
        port.write(frame(command))
        port.flush()
        return validate_response(command, port.read_until(b"\r"))


def tokens(payload: bytes) -> list[str]:
    text = payload[1:].decode("ascii", errors="replace").strip()
    return re.split(r"\s+", text) if text else []


def number(value: str, scale: float = 1.0) -> float | None:
    try:
        if value in {"---.-", "---", "", "NA", "N/A"}:
            return None
        return float(value) * scale
    except (ValueError, TypeError):
        return None


def parse_qpigs(payload: bytes) -> dict[str, Any]:
    fields = tokens(payload)
    if len(fields) < 20:
        raise RuntimeError(f"Unexpected QPIGS field count: {len(fields)}")
    return {
        "gridVoltageV": number(fields[0]), "gridFrequencyHz": number(fields[1]),
        "outputVoltageV": number(fields[2]), "outputFrequencyHz": number(fields[3]),
        "outputApparentPowerVA": number(fields[4]), "loadPowerW": number(fields[5]),
        "loadPercent": number(fields[6]), "busVoltageV": number(fields[7]),
        "batteryVoltageV": number(fields[8]), "batteryChargeCurrentA": number(fields[9]),
        "batterySoc": number(fields[10]), "inverterTemperatureC": number(fields[11]),
        "pvCurrentA": number(fields[12]), "pvVoltageV": number(fields[13]),
        "batteryDischargeCurrentA": number(fields[14]), "deviceFlags": fields[15],
        "batteryVoltageOffset": number(fields[16]), "eepromVersion": fields[17],
        "solarPowerPv1W": number(fields[18]), "deviceStatusFlags": fields[19],
        "rawQpigs": fields,
    }


def parse_qpigs2(payload: bytes) -> dict[str, Any]:
    fields = tokens(payload)
    if len(fields) < 3:
        raise RuntimeError(f"Unexpected QPIGS2 field count: {len(fields)}")
    return {"pv2CurrentA": number(fields[0]), "pv2VoltageV": number(fields[1]), "solarPowerPv2W": number(fields[2]), "rawQpigs2": fields}


def parse_qmod(payload: bytes) -> str:
    text = payload[1:].decode("ascii", errors="replace").strip()
    if not text:
        return "UNKNOWN"
    return {"P": "POWER_ON", "S": "STANDBY", "L": "LINE", "B": "BATTERY", "F": "FAULT", "D": "SHUTDOWN", "C": "CHARGE", "Y": "BYPASS", "E": "ECO"}.get(text[0], f"UNKNOWN({text[0]})")


def parse_qpiws(payload: bytes) -> list[str]:
    bits = "".join(tokens(payload))
    if not bits or any(ch not in "01" for ch in bits):
        return []
    names = {0: "PV loss", 1: "Inverter fault", 2: "Bus over", 3: "Bus under", 4: "Bus soft fail", 5: "Line fail", 6: "Output short", 7: "Inverter voltage low", 8: "Inverter voltage high", 9: "Over temperature", 10: "Fan locked", 11: "Battery voltage high", 12: "Battery low", 14: "Battery under shutdown", 15: "Battery derating", 16: "Overload", 17: "EEPROM fault", 18: "Inverter output voltage low", 19: "Inverter output voltage high", 20: "PV over voltage", 21: "MPPT overload", 22: "PV input short", 23: "Battery disconnected", 24: "Battery BMS"}
    return [name for index, name in names.items() if index < len(bits) and bits[index] == "1"]


def refresh_from_serial(port_name: str, baudrate: int, timeout_ms: int) -> dict[str, Any]:
    qpigs = serial_query(port_name, baudrate, timeout_ms, "QPIGS")
    data = parse_qpigs(qpigs)
    try:
        data.update(parse_qpigs2(serial_query(port_name, baudrate, timeout_ms, "QPIGS2")))
    except Exception:
        pass
    try:
        data["inverterState"] = parse_qmod(serial_query(port_name, baudrate, timeout_ms, "QMOD"))
    except Exception:
        data["inverterState"] = None
    try:
        data["warnings"] = parse_qpiws(serial_query(port_name, baudrate, timeout_ms, "QPIWS"))
    except Exception:
        data["warnings"] = []

    charge_current = data.get("batteryChargeCurrentA")
    discharge_current = data.get("batteryDischargeCurrentA")
    data["batteryCurrentA"] = None if charge_current is None and discharge_current is None else round((charge_current or 0) - (discharge_current or 0), 2)
    data["batteryPowerW"] = None
    if data.get("batteryVoltageV") is not None and data.get("batteryCurrentA") is not None:
        data["batteryPowerW"] = round(data["batteryVoltageV"] * data["batteryCurrentA"], 1)
    pv1, pv2 = data.get("solarPowerPv1W"), data.get("solarPowerPv2W")
    data["solarPowerW"] = None if pv1 is None and pv2 is None else round((pv1 or 0) + (pv2 or 0), 1)
    data["gridPowerW"] = None
    data["source"] = "gateway"
    data["timestamp"] = now_iso()
    return data


async def poll_loop() -> None:
    if not DEFAULT_SERIAL_PORT:
        return
    while True:
        try:
            data = await asyncio.to_thread(refresh_from_serial, DEFAULT_SERIAL_PORT, DEFAULT_BAUDRATE, DEFAULT_TIMEOUT_MS)
            latest.update(data)
            await asyncio.to_thread(save_history, latest)
        except Exception:
            latest.update({"source": "none", "timestamp": now_iso()})
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


@app.on_event("startup")
async def startup() -> None:
    await asyncio.to_thread(db)
    if DEFAULT_SERIAL_PORT:
        asyncio.create_task(poll_loop())


@app.get("/api/device")
def device(x_gateway_token: str | None = Header(default=None)):
    auth(x_gateway_token)
    return DEVICE


@app.get("/api/health")
def health(x_gateway_token: str | None = Header(default=None)):
    auth(x_gateway_token)
    return {"ok": True, "timestamp": now_iso(), "protocol": DEVICE["protocol"], "pi30Configured": True, "serialConfigured": bool(DEFAULT_SERIAL_PORT), "pollIntervalSeconds": POLL_INTERVAL_SECONDS}


@app.get("/api/telemetry")
def telemetry(x_gateway_token: str | None = Header(default=None)):
    auth(x_gateway_token)
    return latest


@app.get("/api/history")
def history(hours: int = 24, x_gateway_token: str | None = Header(default=None)):
    auth(x_gateway_token)
    return {"hours": hours, "items": read_history(hours)}


@app.post("/api/connection/test")
def connection_test(request: ConnectionTestRequest, x_gateway_token: str | None = Header(default=None)):
    auth(x_gateway_token)
    port_name = request.serial_port or DEFAULT_SERIAL_PORT
    if not port_name:
        raise HTTPException(400, "serial_port مطلوب لاتصال Axpert عبر RS232")
    try:
        response = serial_query(port_name, request.baudrate, request.timeout_ms, "QMOD")
        mode = parse_qmod(response)
        return {"ok": True, "latencyMs": None, "message": "تم الاتصال بالإنفرتر وقراءة QMOD بنجاح", "transport": "pi30_serial", "protocol": "PI30", "mode": mode, "registerRead": True}
    except Exception as exc:
        return {"ok": False, "latencyMs": None, "message": f"تعذر الاتصال أو قراءة بروتوكول PI30: {type(exc).__name__}", "transport": "pi30_serial", "protocol": "PI30", "registerRead": False}


@app.post("/api/refresh")
def refresh(request: RefreshRequest, x_gateway_token: str | None = Header(default=None)):
    auth(x_gateway_token)
    port_name = request.serial_port or DEFAULT_SERIAL_PORT
    if not port_name:
        return {"ok": False, "message": "لم يتم تحديد منفذ RS232 في Gateway"}
    try:
        data = refresh_from_serial(port_name, request.baudrate, request.timeout_ms)
        latest.update(data)
        save_history(latest)
        return {"ok": True, "message": "تم تحديث البيانات من الإنفرتر الحقيقي", "telemetry": latest}
    except Exception as exc:
        latest.update({"source": "none", "timestamp": now_iso()})
        return {"ok": False, "message": f"فشل تحديث البيانات الحقيقية: {type(exc).__name__}"}
