import asyncio
import os
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Solar Gateway", version="0.5.1")

TOKEN = os.getenv("GATEWAY_TOKEN", "")
DEFAULT_SERIAL_PORT = os.getenv("INVERTER_SERIAL_PORT", "")
DEFAULT_BAUDRATE = int(os.getenv("INVERTER_BAUDRATE", "2400"))
DEFAULT_TIMEOUT_MS = int(os.getenv("INVERTER_TIMEOUT_MS", "2000"))
POLL_INTERVAL_SECONDS = max(5, int(os.getenv("INVERTER_POLL_INTERVAL_SECONDS", "10")))
DB_PATH = os.getenv("SOLAR_GATEWAY_DB", "solar_gateway.sqlite3")

DEVICE = {
    "manufacturer": "NEXT / Victor",
    "model": "Max-8.2KWM",
    "ratedPowerW": 8200,
    "ratedPowerVA": 8200,
    "batteryNominalVoltageV": 48,
    "acOutputVoltageV": 230,
    "maxPvPowerW": 8200,
    "maxPvVoltageV": 500,
    "pvInputRangeV": {"min": 90, "max": 450},
    "mpptOperatingRangeV": {"min": 360, "max": 450},
    "batteryVoltageRangeV": {"min": 40, "max": 63},
    "communications": ["RS232", "RS485", "Wi-Fi Datalogger"],
    "serialNumber": "92085230517098",
    "dataloggerId": "Q0045395318912",
    "protocol": "PI30",
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
        connection.execute("DELETE FROM telemetry_history WHERE id NOT IN (SELECT id FROM telemetry_history ORDER BY id DESC LIMIT 100000)")
        connection.commit()


def read_history(hours: int = 24, limit: int = 5000) -> list[dict[str, Any]]:
    hours = min(max(hours, 1), 720)
    limit = min(max(limit, 1), 10000)
    with db() as connection:
        rows = connection.execute(
            """SELECT timestamp, solar_power_w, load_power_w, battery_power_w, battery_soc,
                      battery_voltage_v, battery_current_a, grid_power_w, pv_voltage_v,
                      pv_current_a, output_voltage_v, output_frequency_hz,
                      inverter_temperature_c, inverter_state, warnings, alarms
               FROM telemetry_history WHERE timestamp >= datetime('now', ?)
               ORDER BY timestamp ASC LIMIT ?""",
            (f"-{hours} hours", limit),
        ).fetchall()
    return [{"timestamp": row["timestamp"], "solarPowerW": row["solar_power_w"], "loadPowerW": row["load_power_w"], "batteryPowerW": row["battery_power_w"], "batterySoc": row["battery_soc"], "batteryVoltageV": row["battery_voltage_v"], "batteryCurrentA": row["battery_current_a"], "gridPowerW": row["grid_power_w"], "pvVoltageV": row["pv_voltage_v"], "pvCurrentA": row["pv_current_a"], "outputVoltageV": row["output_voltage_v"], "outputFrequencyHz": row["output_frequency_hz"], "inverterTemperatureC": row["inverter_temperature_c"], "inverterState": row["inverter_state"], "warnings": [x for x in row["warnings"].split(",") if x], "alarms": [x for x in row["alarms"].split(",") if x]} for row in rows]


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
    if not response: raise RuntimeError(f"No response to {command}")
    if not response.endswith(b"\r"): raise RuntimeError("Incomplete PI30 response")
    body = response[:-1]
    if len(body) < 3: raise RuntimeError("PI30 response too short")
    payload, received_crc = body[:-2], int.from_bytes(body[-2:], "big")
    if received_crc != crc16_xmodem(payload): raise RuntimeError("PI30 CRC mismatch")
    if not payload.startswith(b"("): raise RuntimeError("Invalid PI30 response header")
    return payload


def serial_query(port_name: str, baudrate: int, timeout_ms: int, command: str) -> bytes:
    try: import serial
    except ImportError as exc: raise RuntimeError("pyserial is not installed") from exc
    timeout = max(timeout_ms, 200) / 1000
    with serial.Serial(port=port_name, baudrate=baudrate, bytesize=serial.EIGHTBITS, parity=serial.PARITY_NONE, stopbits=serial.STOPBITS_ONE, timeout=timeout, write_timeout=timeout, rtscts=False, dsrdtr=False) as port:
        port.reset_input_buffer(); port.write(frame(command)); port.flush(); return validate_response(command, port.read_until(b"\r"))


def tokens(payload: bytes) -> list[str]:
    text = payload[1:].decode("ascii", errors="replace").strip()
    return re.split(r"\s+", text) if text else []


def number(value: str, scale: float = 1.0) -> float | None:
    try:
        if value in {"---.-", "---", "", "NA", "N/A"}: return None
        return float(value) * scale
    except (ValueError, TypeError): return None


def parse_qpigs(payload: bytes) -> dict[str, Any]:
    fields = tokens(payload)
    if len(fields) < 20: raise RuntimeError(f"Unexpected QPIGS field count: {len(fields)}")
    return {"gridVoltageV": number(fields[0]), "gridFrequencyHz": number(fields[1]), "outputVoltageV": number(fields[2]), "outputFrequencyHz": number(fields[3]), "outputApparentPowerVA": number(fields[4]), "loadPowerW": number(fields[5]), "loadPercent": number(fields[6]), "busVoltageV": number(fields[7]), "batteryVoltageV": number(fields[8]), "batteryChargeCurrentA": number(fields[9]), "batterySoc": number(fields[10]), "inverterTemperatureC": number(fields[11]), "pvCurrentA": number(fields[12]), "pvVoltageV": number(fields[13]), "batteryDischargeCurrentA": number(fields[14]), "deviceFlags": fields[15], "batteryVoltageOffset": number(fields[16]), "eepromVersion": fields[17], "solarPowerPv1W": number(fields[18]), "deviceStatusFlags": fields[19], "timestamp": now_iso()}
