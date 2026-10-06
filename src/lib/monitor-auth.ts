export function isMonitoringOwner(username: string) {
  const configuredOwner = (process.env.SOLAR_OWNER_USER || "").trim();
  if (configuredOwner) return username === configuredOwner;

  const primaryOwner = (
    process.env.SOLAR_AUTH_USERNAME ||
    process.env.SOLAR_USER ||
    process.env.SOLAR_USERNAME ||
    ""
  ).trim();

  return Boolean(primaryOwner && username === primaryOwner);
}
