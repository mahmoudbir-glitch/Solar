# Solar Local Gateway

This service runs on the Windows/Linux machine physically connected to the inverter.
It is the bridge between Solar on Vercel and RS485/USB.

## Install
Python 3.11+ is recommended.

Windows:
1. Install Python.
2. Open PowerShell in this folder.
3. Run: python -m venv .venv
4. Run: .\.venv\Scripts\pip install -r requirements.txt
5. Copy .env.example to .env and edit it.
6. Run: .\.venv\Scripts\python gateway.py

Linux:
1. python3 -m venv .venv
2. .venv/bin/pip install -r requirements.txt
3. cp .env.example .env
4. python3 gateway.py

## Environment

| Variable | Purpose |
| --- | --- |
| `INVERTER_PROFILE` | Register map to use. Must match the inverter model. Bundled: `ivem6048-ii` (Felicity IVEM6048-II). The gateway refuses to read without it. `FELICITY_PROFILE` is still accepted. |
| `INVERTER_REGISTER_OFFSET` | Offset applied to every register address, for maps documented 1-based. Defaults to 0. |
| `GATEWAY_TOKEN` | **Required.** Unique secret of at least 32 characters for `POST /v1/inverter/test`; the gateway refuses to start with a missing, short, or example token. Paste the token Solar shows once after "rotate gateway token". |
| `SOLAR_API_URL` | Base URL of the Solar deployment, used by the polling loop. |
| `SOLAR_TELEMETRY_TOKEN` | Required when `SOLAR_API_URL` is set. Use a unique secret of at least 32 characters matching `TELEMETRY_INGEST_TOKEN` in Solar, or every push is rejected. |
| `POLL_INTERVAL_SECONDS` | Seconds between Modbus reads. Minimum 2, default 10. |

### Adding an inverter model

`PROFILES` in `gateway.py` maps a model to its Modbus registers. A map is valid only
for the model it names — addresses and scaling differ between models, and a wrong map
reports plausible but false readings. Take the register map from the manufacturer
manual, add an entry, then point `INVERTER_PROFILE` at it.

**NEXT Power Victor Max-8.2KW is not bundled**: no verified register map is published
for it, so it has no entry yet. Until one is added from the Next Power manual, this
Modbus path cannot read that inverter — its Wi-Fi datalogger (SmartESS/DESSMonitor)
is a separate route and is not read over Modbus by this gateway.

The HTTP endpoint is:
POST /v1/inverter/test

The gateway can also poll the inverter and POST normalized telemetry to:
POST <SOLAR_API_URL>/api/telemetry

Never expose port 8787 directly to the public internet. Put it on the same LAN/VPN as the Solar server or use a secure tunnel/reverse proxy.
The sample binds to `127.0.0.1` so it is not reachable from other machines by default. Set `GATEWAY_HOST=0.0.0.0` only when a trusted LAN or tunnel requires it, and keep the port behind a firewall or VPN.
