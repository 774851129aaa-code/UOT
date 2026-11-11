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

function runYtDlp(args, timeout = 600000) {
    return new Promise((resolve, reject) => {
        const child = spawn("yt-dlp", args);

        let stdout = "";
        let stderr = "";

        const timer = setTimeout(() => {
            child.kill("SIGKILL");
        }, timeout);

        child.stdout.on("data", data => {
            stdout += data.toString();
        });

        child.stderr.on("data", data => {
            stderr += data.toString();
        });

        child.on("error", error => {
            clearTimeout(timer);
            reject(error);
        });

        child.on("close", code => {
            clearTimeout(timer);

            if (code !== 0) {
                return reject(
                    new Error(stderr.slice(-1000) || "فشل التحميل")
                );
            }

            resolve(stdout.trim());
        });
    });
}

async function downloadVideo(rawUrl) {
    const url = validateUrl(rawUrl);

    const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), "telegram-video-")
    );

    const output = path.join(dir, "video.%(ext)s");

    try {
        const metadata = await runYtDlp([
            "--no-playlist",
            "--dump-single-json",
            "--no-warnings",
            url
        ], 120000);

        const info = JSON.parse(metadata);

        if (
            info.duration &&
            info.duration > maxVideoSeconds
        ) {
            throw new Error("الفيديو طويل جدًا");
        }

        await runYtDlp([
            "--no-playlist",
            "--no-warnings",
            "--max-filesize",
            `${Math.floor(maxVideoBytes / 1024 / 1024)}M`,
            "-f",
            "bv*+ba/b",
            "--merge-output-format",
            "mp4",
            "-o",
            output,
            url
        ]);

        const files = fs.readdirSync(dir)
            .filter(file => file.startsWith("video."));

        if (!files.length) {
            throw new Error("لم يتم العثور على الفيديو");
        }

        const filePath = path.join(dir, files[0]);

        const stat = fs.statSync(filePath);

        if (stat.size > maxVideoBytes) {
            throw new Error("حجم الفيديو أكبر من المسموح");
        }

        return {
            filePath,
            dir,
            title: info.title || "Telegram Video",
            description: "Uploaded via Telegram Bot"
        };

    } catch (error) {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });

        throw error;
    }
}

module.exports = {
    downloadVideo
};
