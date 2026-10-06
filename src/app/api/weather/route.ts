import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function numberParam(value: string | null, fallback: number) {
  if (value === null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  const latitude = numberParam(request.nextUrl.searchParams.get("latitude"), 33.8938);
  const longitude = numberParam(request.nextUrl.searchParams.get("longitude"), 35.5018);
  const timezone = request.nextUrl.searchParams.get("timezone") || "Asia/Beirut";
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude.toFixed(5));
  url.searchParams.set("longitude", longitude.toFixed(5));
  url.searchParams.set("timezone", timezone);
  url.searchParams.set("forecast_days", "4");
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,sunshine_duration,daylight_duration");
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,precipitation,cloud_cover,weather_code,shortwave_radiation,direct_radiation,diffuse_radiation");

  try {
    const response = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return NextResponse.json({ error: "weather_unavailable" }, { status: 502 });
    const data = await response.json();
    return NextResponse.json({ ...data, source: "Open-Meteo" }, {
      headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ error: "weather_unavailable" }, { status: 503 });
  }
}
