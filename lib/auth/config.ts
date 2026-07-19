export const SESSION_COOKIE_NAME = "familybrain_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type AuthConfiguration = {
  username: string;
  password: string | null;
  passwordHash: string | null;
  sessionSecret: string;
  configured: boolean;
  configurationError: string | null;
};

export function getAuthConfiguration(): AuthConfiguration {
  const username = process.env.FAMILYBRAIN_USERNAME?.trim() || "admin";
  const password = process.env.FAMILYBRAIN_PASSWORD || null;
  const passwordHash = process.env.FAMILYBRAIN_PASSWORD_HASH?.trim() || null;
  const sessionSecret = process.env.FAMILYBRAIN_SESSION_SECRET?.trim() || "";

  let configurationError: string | null = null;
  if (!password && !passwordHash) {
    configurationError =
      "FAMILYBRAIN_PASSWORD oder FAMILYBRAIN_PASSWORD_HASH fehlt.";
  } else if (sessionSecret.length < 32) {
    configurationError =
      "FAMILYBRAIN_SESSION_SECRET muss mindestens 32 Zeichen lang sein.";
  }

  return {
    username,
    password,
    passwordHash,
    sessionSecret,
    configured: configurationError === null,
    configurationError,
  };
}
