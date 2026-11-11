const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const {
    maxVideoBytes,
    maxVideoSeconds
} = require("./config");

const HOSTS = new Set([
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",

    "instagram.com",
    "www.instagram.com",

    "snapchat.com",
    "www.snapchat.com",

    "pinterest.com",
    "www.pinterest.com",
    "pin.it",

    "youtube.com",
    "www.youtube.com",
    "youtu.be",

    "x.com",
    "www.x.com",
    "twitter.com",
    "www.twitter.com",

    "reddit.com",
    "www.reddit.com",
    "v.redd.it"
]);

function validateUrl(raw) {
    let url;

    try {
        url = new URL(raw);
    } catch {
        throw new Error("الرابط غير صحيح");
    }

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("نوع الرابط غير مسموح");
    }

    if (url.username || url.password) {
        throw new Error("بيانات الدخول داخل الرابط غير مسموحة");
    }

    if (!HOSTS.has(url.hostname.toLowerCase())) {
        throw new Error("هذه المنصة غير مدعومة");
    }

    return url.toString();
}

// تحديد المنصة
function getPlatform(rawUrl) {
    const hostname = new URL(rawUrl).hostname.toLowerCase();

    if (
        hostname === "tiktok.com" ||
        hostname.endsWith(".tiktok.com")
    ) {
        return "tiktok";
    }

    if (
        hostname === "snapchat.com" ||
        hostname.endsWith(".snapchat.com")
    ) {
        return "snapchat";
    }

    if (
        hostname === "instagram.com" ||
        hostname.endsWith(".instagram.com")
    ) {
        return "instagram";
    }

    if (
        hostname === "pinterest.com" ||
        hostname.endsWith(".pinterest.com") ||
        hostname === "pin.it"
    ) {
        return "pinterest";
    }

    return "other";
}

// تنفيذ yt-dlp
function runYtDlp(args, timeout = 600000) {
    return new Promise((resolve, reject) => {
        const child = spawn("yt-dlp", args, {
            stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, timeout);

        child.stdout.on("data", data => {
            stdout += data.toString();
        });

        child.stderr.on("data", data => {
            stderr += data.toString();

            if (stderr.length > 15000) {
                stderr = stderr.slice(-15000);
            }
        });

        child.on("error", error => {
            clearTimeout(timer);
            reject(error);
        });

        child.on("close", code => {
            clearTimeout(timer);

            if (timedOut) {
                return reject(
                    new Error("انتهت مهلة تحميل الفيديو")
                );
            }

            if (code !== 0) {
                return reject(
                    new Error(
                        stderr.slice(-3000) || "فشل التحميل"
                    )
                );
            }

            resolve(stdout.trim());
        });
    });
}

// إعادة المحاولة
async function runWithRetry(args, timeout, attempts = 2) {
    let lastError;

    for (let i = 1; i <= attempts; i++) {
        try {
            return await runYtDlp(args, timeout);
        } catch (error) {
            lastError = error;

            if (i < attempts) {
                await new Promise(resolve =>
                    setTimeout(resolve, 2000)
                );
            }
        }
    }

    throw lastError;
}

// إعدادات خاصة بكل منصة
function getPlatformOptions(platform) {
    const args = [
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout",
        "30",
        "--retries",
        "2",
        "--fragment-retries",
        "2"
    ];

    if (platform === "tiktok") {
        args.push(
            "--impersonate",
            "chrome-146"
        );
    }

    return args;
}

// تحميل الفيديو
async function downloadVideo(rawUrl) {
    const url = validateUrl(rawUrl);
    const platform = getPlatform(url);

    const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), "telegram-video-")
    );

    const output = path.join(dir, "video.%(ext)s");

    try {
        const commonOptions = getPlatformOptions(platform);

        // استخراج معلومات الفيديو
        const metadataArgs = [
            ...commonOptions,
            "--dump-single-json",
            url
        ];

        const metadata = await runWithRetry(
            metadataArgs,
            120000,
            2
        );

        const info = JSON.parse(metadata);

        if (
            typeof info.duration === "number" &&
            info.duration > maxVideoSeconds
        ) {
            throw new Error("الفيديو طويل جدًا");
        }

        // اختيار صيغة الفيديو
        let format = "bv*+ba/b";

        if (platform === "snapchat") {
            format = "best[ext=mp4]/best";
        }

        // تنزيل الفيديو
        const downloadArgs = [
            ...commonOptions,

            "--max-filesize",
            `${Math.floor(maxVideoBytes / 1024 / 1024)}M`,

            "-f",
            format,

            "--merge-output-format",
            "mp4",

            "-o",
            output,

            url
        ];

        await runWithRetry(
            downloadArgs,
            600000,
            2
        );

        // البحث عن الملف
        const files = fs.readdirSync(dir)
            .filter(file =>
                file.startsWith("video.") &&
                !file.endsWith(".part") &&
                !file.endsWith(".ytdl")
            );

        if (!files.length) {
            throw new Error("لم يتم العثور على الفيديو بعد التحميل");
        }

        const filePath = path.join(dir, files[0]);

        const stat = fs.statSync(filePath);

        if (!stat.isFile() || stat.size === 0) {
            throw new Error("ملف الفيديو فارغ أو غير صالح");
        }

        if (stat.size > maxVideoBytes) {
            throw new Error("حجم الفيديو أكبر من المسموح");
        }

        return {
            filePath,
            dir,

            title: info.title || "Telegram Video",

            description:
                info.description ||
                "Uploaded via Telegram Bot"
        };

    } catch (error) {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });

        console.error(
            `[Downloader:${platform}]`,
            error.message
        );

        throw new Error(
            `فشل تحميل فيديو ${platform}: ${error.message.slice(0, 700)}`
        );
    }
}

module.exports = {
    downloadVideo
};
