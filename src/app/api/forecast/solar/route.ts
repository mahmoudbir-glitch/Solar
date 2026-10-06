import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finite(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  let latitude = finite(params.get("latitude"), 33.8938);
  let longitude = finite(params.get("longitude"), 35.5018);
  let panelPowerW = finite(params.get("panelPowerW"), 6000);
  let panelTilt: number | null = params.has("panelTilt") ? finite(params.get("panelTilt"), 30) : null;
  let panelAzimuth: number | null = params.has("panelAzimuth") ? finite(params.get("panelAzimuth"), 0) : null;
  let timezone = params.get("timezone") || "Asia/Beirut";

  if (process.env.DATABASE_URL) {
    try {
      const settings = await prisma.energySettings.findUnique({ where: { id: "default" } });
      if (settings) {
        latitude = settings.latitude;
        longitude = settings.longitude;
        panelPowerW = settings.panelPowerW;
        panelTilt = settings.panelTilt;
        panelAzimuth = settings.panelAzimuth;
        timezone = settings.timezone;
      }
    } catch {
      // Forecast remains available from request/default parameters if the database is unavailable.
    }
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude.toFixed(5));
  url.searchParams.set("longitude", longitude.toFixed(5));
  url.searchParams.set("timezone", timezone);
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("daily", "sunrise,sunset,shortwave_radiation_sum");
  url.searchParams.set("hourly", [
    "temperature_2m",
    "cloud_cover",
    "weather_code",
    "shortwave_radiation",
    ...(panelTilt != null && panelAzimuth != null ? ["global_tilted_irradiance"] : []),
  ].join(","));

  if (panelTilt != null && panelAzimuth != null) {
    url.searchParams.set("tilt", String(Math.max(0, Math.min(90, panelTilt))));
    // Settings hold a compass bearing (0 = north, 180 = south); Open-Meteo counts from south.
    url.searchParams.set("azimuth", String(Math.max(-180, Math.min(180, ((panelAzimuth % 360) + 360) % 360 - 180))));
  }

  try {
    const response = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) {
      return NextResponse.json({ error: "solar_forecast_unavailable" }, { status: 502 });
    }

    const data = await response.json();
    const radiation = data.hourly.global_tilted_irradiance ?? data.hourly.shortwave_radiation;
    const hours = Array.isArray(data.hourly.time) ? data.hourly.time : [];

    const hourly = hours.map((time: string, index: number) => {
      const radiationWm2 = Math.max(0, Number(radiation?.[index] ?? 0));
      const productionKWh = (radiationWm2 / 1000) * (panelPowerW / 1000) * 0.82;
      return {
        time,
        radiationWm2,
        productionKWh: Number(productionKWh.toFixed(3)),
        temperatureC: data.hourly.temperature_2m?.[index] ?? null,
        cloudCoverPct: data.hourly.cloud_cover?.[index] ?? null,
        weatherCode: data.hourly.weather_code?.[index] ?? null,
      };
    });

    return NextResponse.json(
      {
        source: "Open-Meteo",
        location: { latitude, longitude, timezone },
        panel: { panelPowerW, panelTilt, panelAzimuth },
        daily: data.daily,
        hourly,
      },
      { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" } },
    );
  } catch {
    return NextResponse.json({ error: "solar_forecast_unavailable" }, { status: 503 });
  }
}
