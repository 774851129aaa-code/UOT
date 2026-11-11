require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");

const {
    required,
    dataDir
} = require("./config");

const {
    getAuthUrl,
    exchangeCode
} = require("./youtube");

const bot = require("./bot");

const app = express();
const PORT = process.env.PORT || 3000;

const pendingStates = new Map();

app.get("/", (req, res) => {
    res.send(`
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width">
            <title>YouTube Connection</title>
        </head>
        <body style="font-family:Arial;text-align:center;padding:60px">
            <h1>Telegram YouTube Publisher</h1>
            <p>اربط حسابك على YouTube لتفعيل النشر التلقائي.</p>
            <a href="/connect-youtube"
               style="background:#d00;color:white;padding:15px 25px;
               text-decoration:none;border-radius:8px">
               ربط حساب YouTube
            </a>
        </body>
        </html>
    `);
});

app.get("/connect-youtube", (req, res) => {
    try {
        const state = crypto.randomBytes(32).toString("hex");

        pendingStates.set(state, Date.now() + 10 * 60 * 1000);

        const authUrl = getAuthUrl(state);

        res.redirect(authUrl);

    } catch (error) {
        console.error(error);
        res.status(500).send("تعذر بدء تسجيل الدخول.");
    }
});

app.get("/oauth2callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).send("تم إلغاء تسجيل الدخول أو رفض الصلاحيات.");
    }

    if (
        !code ||
        !state ||
        !pendingStates.has(state) ||
        pendingStates.get(state) < Date.now()
    ) {
        return res.status(400).send("طلب تسجيل الدخول غير صالح أو انتهت صلاحيته.");
    }

    pendingStates.delete(state);

    try {
        await exchangeCode(code);

        res.send(`
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width">
            </head>
            <body style="font-family:Arial;text-align:center;padding:60px">
                <h1 style="color:green">✅ تم الربط بنجاح!</h1>
                <p>أصبح بإمكان البوت رفع الفيديوهات إلى قناتك.</p>
                <p>يمكنك العودة إلى تيليجرام الآن.</p>
            </body>
            </html>
        `);

    } catch (err) {
        console.error("OAuth error:", err);
        res.status(500).send("فشل ربط حساب YouTube. راجع سجلات التطبيق.");
    }
});

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

async function start() {
    fs.mkdirSync(dataDir, { recursive: true });

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Web server running on port ${PORT}`);
    });

    await bot.launch();

    console.log("Telegram bot started successfully");
}

start().catch(error => {
    console.error("Startup error:", error);
    process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
