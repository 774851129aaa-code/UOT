const fs = require("fs");
const { google } = require("googleapis");

const {
getOAuthConfig,
tokenPath,
dataDir,
privacyStatus
} = require("./config");

// الوصف الثابت لجميع الفيديوهات
const FIXED_DESCRIPTION = `
🌍 أهلاً وسهلاً بكم في عالم المحتوى العربي!

نقدم لكم فيديوهات متنوعة ومميزة، ونسعى للوصول إلى جميع المشاهدين في الوطن العربي ❤️

📍 نرحب بمتابعينا من جميع الدول العربية:

🇾🇪 اليمن | 🇸🇦 السعودية | 🇦🇪 الإمارات
🇪🇬 مصر | 🇰🇼 الكويت | 🇶🇦 قطر
🇧🇭 البحرين | 🇴🇲 عُمان | 🇮🇶 العراق
🇯🇴 الأردن | 🇵🇸 فلسطين | 🇸🇾 سوريا
🇱🇧 لبنان | 🇱🇾 ليبيا | 🇹🇳 تونس
🇩🇿 الجزائر | 🇲🇦 المغرب | 🇸🇩 السودان
🇸🇴 الصومال | 🇩🇯 جيبوتي | 🇲🇷 موريتانيا
🇰🇲 جزر القمر

━━━━━━━━━━━━━━━━

#اليمن #السعودية #الإمارات #مصر
#الكويت #قطر #البحرين #عمان
#العراق #الأردن #فلسطين #سوريا
#لبنان #ليبيا #تونس #الجزائر
#المغرب #السودان #الصومال #جيبوتي
#موريتانيا #جزر_القمر

#المحتوى_العربي #فيديو #Shorts #YouTubeShorts
`;

// إنشاء وصف الفيديو
function buildDescription(originalDescription = "") {
const original = String(originalDescription || "").trim();

const finalDescription = [
    original,
    FIXED_DESCRIPTION
].filter(Boolean).join("\n\n");

return finalDescription.slice(0, 4500);

}

function makeOAuthClient() {
const config = getOAuthConfig();

return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
);

}

function loadTokens() {
if (!fs.existsSync(tokenPath)) {
return null;
}

return JSON.parse(
    fs.readFileSync(tokenPath, "utf8")
);

}

function saveTokens(tokens) {
fs.mkdirSync(dataDir, { recursive: true });

const temp = `${tokenPath}.tmp`;

fs.writeFileSync(
    temp,
    JSON.stringify(tokens, null, 2),
    { mode: 0o600 }
);

fs.renameSync(temp, tokenPath);

}

// إنشاء رابط تسجيل الدخول
function getAuthUrl(state) {
const oauth = makeOAuthClient();

return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",

    scope: [
        "https://www.googleapis.com/auth/youtube.upload"
    ],

    state
});

}

// استقبال موافقة Google
async function exchangeCode(code) {
const oauth = makeOAuthClient();

const { tokens } = await oauth.getToken(code);

const previous = loadTokens() || {};

const refreshToken =
    tokens.refresh_token || previous.refresh_token;

if (!refreshToken) {
    throw new Error(
        "لم يتم استلام Refresh Token من Google"
    );
}

saveTokens({
    ...previous,
    ...tokens,
    refresh_token: refreshToken
});

return true;

}

// الاتصال بحساب YouTube
async function getYouTube() {
const tokens = loadTokens();

if (!tokens?.refresh_token) {
    throw new Error("حساب YouTube غير مرتبط");
}

const oauth = makeOAuthClient();

oauth.setCredentials(tokens);

oauth.on("tokens", fresh => {
    const old = loadTokens() || {};

    saveTokens({
        ...old,
        ...fresh
    });
});

return google.youtube({
    version: "v3",
    auth: oauth
});

}

// رفع الفيديو
async function uploadVideo(filePath, title, description = "") {
const youtube = await getYouTube();

const response = await youtube.videos.insert({
    part: ["snippet", "status"],

    requestBody: {
        snippet: {
            title: String(title || "Video from Telegram")
                .replace(/[\r\n\0]/g, " ")
                .slice(0, 100),

            description: buildDescription(description),

            categoryId: "22"
        },

        status: {
            privacyStatus
        }
    },

    media: {
        body: fs.createReadStream(filePath)
    }
});

return `https://www.youtube.com/watch?v=${response.data.id}`;

}

// معرفة حالة الربط
async function isConnected() {
const tokens = loadTokens();

return tokens?.refresh_token
    ? "حساب YouTube المرتبط"
    : null;

}

module.exports = {
getAuthUrl,
exchangeCode,
uploadVideo,
isConnected
};
