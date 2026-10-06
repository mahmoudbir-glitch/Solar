export function getAuthConfig() {
  const username = (
    process.env.SOLAR_AUTH_USERNAME ||
    process.env.SOLAR_USER ||
    process.env.SOLAR_USERNAME ||
    ""
  ).trim();

  const password = process.env.SOLAR_AUTH_PASSWORD || process.env.SOLAR_PASSWORD || "";
  const passwordHash = process.env.SOLAR_PASSWORD_HASH || "";

  const ownerUsername = (
    process.env.SOLAR_OWNER_USER ||
    ""
  ).trim();
  const ownerPassword = process.env.SOLAR_OWNER_PASSWORD || "";

  const secret = process.env.AUTH_SECRET || process.env.SOLAR_AUTH_SECRET || "";

  return {
    username,
    password,
    passwordHash,
    ownerUsername,
    ownerPassword,
    secret,
    // Either the shared account or the separate owner account is enough
    // to enable authentication. Requiring SOLAR_USER as well would make
    // a correctly configured owner-only deployment return 503 forever.
    configured: Boolean(
      secret &&
      (
        (username && (password || passwordHash)) ||
        (ownerUsername && ownerPassword)
      )
    ),
  };
}
