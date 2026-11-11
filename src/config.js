const path = require("path");

function required(name) {
    const value = process.env[name];

    if (!value || !value.trim()) {
        throw new Error(`Missing environment variable: ${name}`);
    }

    return value.trim();
}

function getOAuthConfig() {
    const raw = JSON.parse(
        required("GOOGLE_CREDENTIALS_JSON")
    );

    const client = raw.web || raw.installed;

    if (!client?.client_id || !client?.client_secret) {
        throw new Error("Invalid Google OAuth credentials");
    }

    return {
        clientId: client.client_id,
        clientSecret: client.client_secret,
        redirectUri: required("GOOGLE_REDIRECT_URI")
    };
}

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");

module.exports = {
    required,
    getOAuthConfig,

    dataDir,

    tokenPath: path.join(dataDir, "youtube-token.json"),
    statePath: path.join(dataDir, "oauth-state.json"),

    maxVideoBytes:
        Number(process.env.MAX_VIDEO_MB || 500) * 1024 * 1024,

    maxVideoSeconds:
        Number(process.env.MAX_VIDEO_SECONDS || 900),

    privacyStatus:
        ["private", "unlisted", "public"].includes(
            process.env.YOUTUBE_PRIVACY_STATUS
        )
            ? process.env.YOUTUBE_PRIVACY_STATUS
            : "private",

    appBaseUrl: (process.env.APP_BASE_URL || "").replace(/\/$/, "")
};
