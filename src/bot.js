const { Telegraf } = require("telegraf");
const fs = require("fs");

const { required, appBaseUrl } = require("./config");
const { downloadVideo } = require("./downloader");
const { uploadVideo, isConnected } = require("./youtube");

const bot = new Telegraf(required("TELEGRAM_BOT_TOKEN"));

const adminId = String(required("TELEGRAM_ADMIN_ID"));

bot.start(async ctx => {
    if (String(ctx.from.id) !== adminId) return;

    await ctx.reply(
        "مرحبًا بك في بوت النشر التلقائي 🚀\n\n" +
        "أرسل رابط فيديو وسأقوم بتحميله ورفعه إلى قناتك على YouTube.\n\n" +
        "/status - حالة الربط\n" +
        "/connect - رابط ربط YouTube"
    );
});

bot.command("connect", async ctx => {
    if (String(ctx.from.id) !== adminId) return;

    await ctx.reply(
        `اربط قناتك من هنا:\n${appBaseUrl}/connect-youtube`
    );
});

bot.command("status", async ctx => {
    if (String(ctx.from.id) !== adminId) return;

    const connected = await isConnected();

    await ctx.reply(
        connected
            ? "✅ حساب YouTube مرتبط."
            : "❌ لم يتم ربط حساب YouTube بعد."
    );
});

bot.on("text", async ctx => {
    if (String(ctx.from.id) !== adminId) return;

    const rawUrl = ctx.message.text.trim();

    if (!/^https?:\/\//i.test(rawUrl)) return;

    let downloaded;

    try {
        const connected = await isConnected();

        if (!connected) {
            await ctx.reply(
                "❌ اربط حساب YouTube أولًا باستخدام /connect"
            );
            return;
        }

        const status = await ctx.reply(
            "⏳ جاري تحميل الفيديو..."
        );

        downloaded = await downloadVideo(rawUrl);

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            status.message_id,
            undefined,
            "📤 تم التحميل. جاري رفع الفيديو إلى YouTube..."
        );

        const videoUrl = await uploadVideo(
            downloaded.filePath,
            downloaded.title,
            downloaded.description
        );

        await ctx.telegram.sendMessage(
            ctx.chat.id,
            "✅ تم نشر الفيديو بنجاح!\n\n" +
            `🎬 رابط الفيديو:\n${videoUrl}`
        );

    } catch (error) {
        console.error("Processing error:", error);

        await ctx.reply(
            "❌ حدث خطأ أثناء معالجة الفيديو:\n" +
            error.message.slice(0, 500)
        );

    } finally {
        if (downloaded?.dir) {
            fs.rmSync(downloaded.dir, {
                recursive: true,
                force: true
            });
        }
    }
});

bot.catch(error => {
    console.error("Telegram bot error:", error);
});

module.exports = bot;
