const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const archiver = require('archiver');
const { execSync, exec } = require('child_process');
const cheerio = require('cheerio');
const youtubedl = require('youtube-dl-exec');

const app = express();
app.use(cors());

const port = process.env.SERVER_PORT || process.env.PORT || 8000;

// Global tracking for tasks and active downloads
const downloadProgress = new Map();
const activeTasks = new Set();

// Cleanup function to delete temporary files
function cleanupFiles(baseName) {
    const dir = __dirname;
    fs.readdir(dir, (err, files) => {
        if (err) return;
        files.forEach(file => {
            if (file.startsWith(baseName)) {
                fs.unlink(path.join(dir, file), () => {});
            }
        });
    });
}

function getSafeFilename(text, maxLen = 50) {
    if (!text) return "";
    let safe = text.replace(/[#@]\S+/g, '');
    safe = safe.replace(/[\\/:*?"<>|]/g, '');
    safe = safe.replace(/\s+/g, '_').trim();
    safe = safe.replace(/_+/g, '_');
    safe = safe.replace(/^_+|_+$/g, '');
    safe = safe.replace(/^\.+|\.+$/g, '');
    return safe.substring(0, maxLen);
}

app.get('/', (req, res) => {
    res.json({ status: "online", message: "RaiSaver Node.js Backend is running!" });
});

app.get('/progress', (req, res) => {
    const taskId = req.query.task_id;
    if (!taskId) return res.status(400).json({ error: "task_id required" });
    const prog = downloadProgress.get(taskId) || { status: "not_found", progress: 0.0 };
    res.json(prog);
});

// Proxy Image
app.get('/proxy-image', async (req, res) => {
    const url = req.query.url;
    if (!url || !url.startsWith("http")) {
        const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
        return res.set('Content-Type', 'image/png').send(pixel);
    }
    try {
        let referer = 'https://www.google.com/';
        if (url.includes('tiktok') || url.includes('muscdn')) referer = 'https://www.tiktok.com/';
        else if (url.includes('instagram') || url.includes('fbcdn')) referer = 'https://www.instagram.com/';

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Referer": referer,
                "Accept": "image/*,*/*;q=0.8"
            },
            timeout: 20000
        });
        const contentType = response.headers['content-type'] || 'image/jpeg';
        res.set('Content-Type', contentType.split(';')[0].trim());
        res.send(response.data);
    } catch (error) {
        const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
        res.set('Content-Type', 'image/png').send(pixel);
    }
});

// TikTok Info
app.get('/tiktok/info', async (req, res) => {
    try {
        let url = req.query.url;
        if (!url) return res.status(400).json({ detail: "URL required" });
        url = url.split('?')[0];

        const response = await axios.post("https://www.tikwm.com/api/", new URLSearchParams({ url, hd: 1 }), {
            headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 15000
        });

        const data = response.data;
        if (data.code !== 0) throw new Error(data.msg || "TikWM Error");

        const vdata = data.data;
        const title = vdata.title || "TikTok Video";
        const author = vdata.author || {};
        const username = author.unique_id || "Unknown";
        const nickname = author.nickname || username;
        const playUrl = vdata.play || "";
        const hdplayUrl = vdata.hdplay || "";
        const images = vdata.images || [];
        const isPhoto = images.length > 0;
        let thumbnail = vdata.cover || vdata.origin_cover || (isPhoto ? images[0] : "");

        const videoFormats = [];
        if (isPhoto) {
            images.forEach((img, idx) => {
                videoFormats.push({ resolution: `Image ${idx + 1}`, format_id: `img_${idx}`, ext: "jpg", download_url: img });
            });
        } else {
            if (hdplayUrl) videoFormats.push({ resolution: "HD Quality", format_id: "hd", ext: "mp4", download_url: hdplayUrl });
            if (playUrl && playUrl !== hdplayUrl) videoFormats.push({ resolution: "Standard Quality", format_id: "sd", ext: "mp4", download_url: playUrl });
        }

        res.json({
            title, thumbnail, channel: `@${username} (${nickname})`, duration: vdata.duration || 0,
            description: title, video_formats: videoFormats, platform: "tiktok", play_count: vdata.play_count || 0, is_photo: isPhoto
        });
    } catch (e) {
        console.error(e);
        res.status(400).json({ detail: e.message });
    }
});

// Helper to download stream and report progress
async function downloadStream(url, destPath, taskId, startPct = 0, endPct = 1) {
    const writer = fs.createWriteStream(destPath);
    const response = await axios({
        url, method: 'GET', responseType: 'stream',
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.tiktok.com/" },
        timeout: 60000
    });
    const total = parseInt(response.headers['content-length'] || '0');
    let got = 0;
    const startTime = Date.now();
    let lastUpdate = Date.now();
    
    response.data.on('data', chunk => {
        got += chunk.length;
        const now = Date.now();
        if (now - lastUpdate > 250 || got === total) {
            lastUpdate = now;
            if (total > 0 && downloadProgress.has(taskId)) {
                const prog = startPct + (got / total) * (endPct - startPct);
                let speedStr = "";
                const elapsed = (now - startTime) / 1000;
                if (elapsed > 0) {
                    const speedBps = got / elapsed;
                    speedStr = (speedBps / 1048576).toFixed(2) + "MiB/s";
                }
                const totalStr = (total / 1048576).toFixed(1) + "MB";
                
                // Add padding so the string is long enough to overwrite previous CLI text
                downloadProgress.set(taskId, { 
                    status: "downloading", 
                    progress: prog, 
                    total: totalStr, 
                    speed: speedStr.padEnd(15, " ") 
                });
            }
        }
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

function mergeAudio(videoPath, audioPath, outputPath) {
    const ffmpegPath = require('ffmpeg-static');
    // We use amix to mix both the original video audio and the added music track,
    // and then apply loudnorm to normalize the volume to a standard loud level,
    // which completely fixes the issue of quiet TikTok sounds.
    const cmd = `"${ffmpegPath}" -y -i "${videoPath}" -i "${audioPath}" -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2,loudnorm" -c:v copy -c:a aac -shortest "${outputPath}"`;
    try {
        execSync(cmd, { stdio: 'ignore' });
        return true;
    } catch (e) {
        console.error("FFmpeg merge error:", e);
        return false;
    }
}

// TikTok Download
app.get('/tiktok/download', async (req, res) => {
    let { url, format_id, task_id } = req.query;
    if (!task_id) task_id = crypto.randomUUID();
    
    if (activeTasks.has(task_id)) {
        for (let i = 0; i < 60; i++) {
            const prog = downloadProgress.get(task_id);
            if (prog?.status === "completed" && fs.existsSync(prog.final_path)) {
                const fname = path.basename(prog.final_path);
                return res.download(prog.final_path, fname);
            }
            if (prog?.status === "error") return res.status(400).json({ detail: prog.error });
            await new Promise(r => setTimeout(r, 1000));
        }
        return res.status(408).json({ detail: "Timeout" });
    }

    activeTasks.add(task_id);
    downloadProgress.set(task_id, { status: "starting", progress: 0.0 });
    const baseName = `temp_${task_id}`;

    try {
        url = url.split('?')[0];
        const apiResp = await axios.post("https://www.tikwm.com/api/", new URLSearchParams({ url, hd: 1 }), {
            headers: { "User-Agent": "Mozilla/5.0" }, timeout: 15000
        });
        const vdata = apiResp.data.data;
        if (!vdata) throw new Error("No data from TikWM");
        
        const isPhoto = !!vdata.images;
        const title = vdata.title || "tiktok";

        if (isPhoto) {
            const images = vdata.images || [];
            const idx = parseInt((format_id || "img_0").replace("img_", "")) || 0;
            const imgUrl = images[idx < images.length ? idx : 0];
            const imgPath = path.join(__dirname, `${baseName}_img${idx}.jpg`);
            
            await downloadStream(imgUrl, imgPath, task_id, 0.1, 0.9);
            downloadProgress.set(task_id, { status: "completed", progress: 1.0, final_path: imgPath });
            
            res.on('finish', () => { cleanupFiles(baseName); downloadProgress.delete(task_id); activeTasks.delete(task_id); });
            const safe = `tiktok_${Date.now()}_img${idx + 1}`;
            return res.download(imgPath, `${safe}.jpg`);
        } else {
            const videoUrl = (format_id === 'sd' && vdata.play) ? vdata.play : (vdata.hdplay || vdata.play);
            if (!videoUrl) throw new Error("No video URL");
            
            const videoPath = path.join(__dirname, `${baseName}_video.mp4`);
            
            // If music track exists, download both and merge to fix low volume issues
            if (vdata.music) {
                const audioPath = path.join(__dirname, `${baseName}_audio.mp3`);
                const mergedPath = path.join(__dirname, `${baseName}_merged.mp4`);
                
                // Download video to 50%
                await downloadStream(videoUrl, videoPath, task_id, 0.05, 0.5);
                
                // Download audio to 90%
                downloadProgress.set(task_id, { status: "downloading", progress: 0.5, total: "Fetching Audio...", speed: "" });
                await downloadStream(vdata.music, audioPath, task_id, 0.5, 0.9);
                
                downloadProgress.set(task_id, { status: "downloading", progress: 0.9, total: "Mixing Audio...  ", speed: "" });
                const success = mergeAudio(videoPath, audioPath, mergedPath);
                
                const finalPath = success ? mergedPath : videoPath;
                downloadProgress.set(task_id, { status: "completed", progress: 1.0, final_path: finalPath });
                const safeTitle = getSafeFilename(title, 60) || `tiktok_${Date.now()}`;
                
                res.on('finish', () => { cleanupFiles(baseName); downloadProgress.delete(task_id); activeTasks.delete(task_id); });
                return res.download(finalPath, `${safeTitle}.mp4`);
            } else {
                await downloadStream(videoUrl, videoPath, task_id, 0.05, 1.0);
                
                downloadProgress.set(task_id, { status: "completed", progress: 1.0, final_path: videoPath });
                const safeTitle = getSafeFilename(title, 60) || `tiktok_${Date.now()}`;
                
                res.on('finish', () => { cleanupFiles(baseName); downloadProgress.delete(task_id); activeTasks.delete(task_id); });
                return res.download(videoPath, `${safeTitle}.mp4`);
            }
        }
    } catch (e) {
        cleanupFiles(baseName);
        downloadProgress.set(task_id, { status: "error", error: e.message });
        activeTasks.delete(task_id);
        res.status(400).json({ detail: e.message });
    }
});

// TikTok Download All (ZIP)
app.get('/tiktok/download/all', async (req, res) => {
    let { url, task_id } = req.query;
    if (!task_id) task_id = crypto.randomUUID();
    const baseName = `temp_tt_all_${task_id}`;
    const zipPath = path.join(__dirname, `${baseName}.zip`);
    
    downloadProgress.set(task_id, { status: "starting", progress: 0.0 });
    try {
        url = url.split('?')[0];
        const apiResp = await axios.post("https://www.tikwm.com/api/", new URLSearchParams({ url, hd: 1 }));
        const vdata = apiResp.data.data;
        if (!vdata || !vdata.images) throw new Error("No photos found");
        
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 5 } });
        archive.pipe(output);
        
        for (let i = 0; i < vdata.images.length; i++) {
            downloadProgress.set(task_id, { status: "downloading", progress: i / vdata.images.length });
            const imgRes = await axios.get(vdata.images[i], { responseType: 'stream' });
            archive.append(imgRes.data, { name: `media_${i + 1}.jpg` });
        }
        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.finalize();
        });
        downloadProgress.set(task_id, { status: "completed", progress: 1.0 });
        
        const safeTitle = getSafeFilename(vdata.title, 60) || "tiktok_photos";
        res.on('finish', () => { cleanupFiles(baseName); downloadProgress.delete(task_id); });
        return res.download(zipPath, `${safeTitle}.zip`);
    } catch (e) {
        cleanupFiles(baseName);
        downloadProgress.delete(task_id);
        res.status(400).json({ detail: e.message });
    }
});

// --- Instagram Helpers ---
async function fetchInstagramViaSnapsave(url) {
    const cleanUrl = url.split('?')[0];
    const formData = new URLSearchParams();
    formData.append('url', cleanUrl);

    const response = await axios.post("https://snapsave.app/action.php?lang=en", formData, {
        headers: { "accept": "*/*", "content-type": "application/x-www-form-urlencoded", "origin": "https://snapsave.app", "referer": "https://snapsave.app/" },
        timeout: 30000
    });

    const decodedHtml = execSync(`node decrypt_snapsave.js`, { input: response.data, cwd: __dirname }).toString();
    const $ = cheerio.load(decodedHtml);
    const mediaList = [];

    // Table layout
    $('table.table tbody tr').each((i, el) => {
        const cols = $(el).find('td');
        if (cols.length >= 3) {
            const resolution = $(cols[0]).text().trim();
            let mediaUrl = $(cols[2]).find('a').attr('href') || "";
            if (!mediaUrl) {
                const onclick = $(cols[2]).find('button').attr('onclick') || "";
                const match = onclick.match(/get_progressApi\('(.*?)'\)/);
                if (match) mediaUrl = "https://snapsave.app" + match[1];
            }
            if (mediaUrl) mediaList.push({ resolution, type: "video", url: mediaUrl });
        }
    });

    // Download items layout
    if (mediaList.length === 0) {
        $('.download-items').each((i, el) => {
            const btn = $(el).find('.download-items__btn');
            if (btn.length) {
                const mediaUrl = btn.find('a').attr('href') || "";
                const spanText = btn.find('span').text().trim();
                const mediaType = spanText.includes("Photo") ? "image" : "video";
                if (mediaUrl) mediaList.push({ type: mediaType, url: mediaUrl });
            }
        });
    }

    // Card layout
    if (mediaList.length === 0) {
        $('.card-body').each((i, el) => {
            const aTag = $(el).find('a');
            if (aTag.length) {
                const mediaUrl = aTag.attr('href') || "";
                const aText = aTag.text().trim();
                const mediaType = aText.includes("Photo") ? "image" : "video";
                if (mediaUrl) mediaList.push({ type: mediaType, url: mediaUrl });
            }
        });
    }

    if (mediaList.length === 0) throw new Error("SnapSave: No media found");

    let title = "Instagram Post";
    let channel = "Instagram";
    let description = "";
    let thumbnail = "";
    
    // Try to extract metadata from Instagram page directly first
    try {
        const metaRes = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
        const $ = cheerio.load(metaRes.data);
        const ogTitle = $('meta[property="og:title"]').attr('content');
        const ogDesc = $('meta[property="og:description"]').attr('content');
        
        if (ogTitle) title = ogTitle;
        if (ogDesc) {
            description = ogDesc;
            const match = ogDesc.match(/- ([a-zA-Z0-9._]+) on /);
            if (match && match[1]) channel = `@${match[1]}`;
        }
    } catch (e) {}

    // Fallback to yt-dlp
    try {
        const ytdlInfo = await youtubedl(url, { dumpSingleJson: true, noWarnings: true, quiet: true });
        if (ytdlInfo) {
            if (title === "Instagram Post") title = ytdlInfo.title || title;
            if (!description) description = ytdlInfo.description || "";
            if (!thumbnail) thumbnail = ytdlInfo.thumbnail || "";
            
            if (channel === "Instagram") {
                if (ytdlInfo.uploader) channel = `@${ytdlInfo.uploader}`;
                else if (ytdlInfo.channel) channel = `@${ytdlInfo.channel}`;
                else if ((ytdlInfo.title || "").startsWith("Post by ")) channel = `@${ytdlInfo.title.substring(8)}`;
                else if ((ytdlInfo.title || "").startsWith("Video by ")) channel = `@${ytdlInfo.title.substring(9)}`;
                else if ((ytdlInfo.title || "").startsWith("Photo by ")) channel = `@${ytdlInfo.title.substring(9)}`;
            }
        }
    } catch (e) {}

    let hasVideo = false;
    const videoFormats = mediaList.filter(m => m.url).map((m, idx) => {
        if (m.type === 'video') hasVideo = true;
        return {
            resolution: m.resolution || (m.type === 'video' ? `Video ${idx + 1}` : `Foto ${idx + 1}`),
            format_id: `snapsave_${idx}`, ext: m.type === 'video' ? 'mp4' : 'jpg', download_url: m.url
        };
    });

    const isCarousel = mediaList.length > 1;
    const isPhoto = !hasVideo;

    if (!thumbnail && isPhoto && videoFormats.length > 0) {
        thumbnail = videoFormats[0].download_url;
    }

    if (!isCarousel && !isPhoto) {
        for (let fmt of videoFormats) {
            if (fmt.resolution.includes("Video")) {
                fmt.resolution = "HD (High Quality)";
                break;
            }
        }
    }

    return { title, description, thumbnail, channel, duration: null, video_formats: videoFormats, platform: "instagram", is_photo: isPhoto, is_carousel: isCarousel };
}

// Instagram Info
app.get('/instagram/info', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).json({ detail: "URL required" });
        const result = await fetchInstagramViaSnapsave(url);
        res.json(result);
    } catch (e) {
        res.status(400).json({ detail: `Gagal mengambil info Instagram: ${e.message}` });
    }
});

// Instagram Download
app.get('/instagram/download', async (req, res) => {
    let { url, format_id = "best", task_id } = req.query;
    if (!task_id) task_id = crypto.randomUUID();
    
    if (activeTasks.has(task_id)) return res.status(408).json({ detail: "Timeout" });
    activeTasks.add(task_id);
    downloadProgress.set(task_id, { status: "starting", progress: 0.0 });
    const baseName = `temp_ig_${task_id}`;

    try {
        const info = await fetchInstagramViaSnapsave(url);
        const formats = info.video_formats || [];
        let format = formats.find(f => f.format_id === format_id) || formats[0];
        if (!format || !format.download_url) throw new Error("URL media tidak ditemukan.");

        const destPath = path.join(__dirname, `${baseName}.${format.ext}`);
        await downloadStream(format.download_url, destPath, task_id, 0.1, 1.0);
        
        downloadProgress.set(task_id, { status: "completed", progress: 1.0 });
        const safeTitle = getSafeFilename(info.title, 60) || `instagram_${task_id}`;
        
        res.on('finish', () => { cleanupFiles(baseName); downloadProgress.delete(task_id); activeTasks.delete(task_id); });
        return res.download(destPath, `${safeTitle}.${format.ext}`);
    } catch (e) {
        cleanupFiles(baseName);
        downloadProgress.delete(task_id);
        activeTasks.delete(task_id);
        res.status(400).json({ detail: e.message });
    }
});

// Instagram Download All (ZIP)
app.get('/instagram/download/all', async (req, res) => {
    let { url, task_id } = req.query;
    if (!task_id) task_id = crypto.randomUUID();
    const baseName = `temp_ig_all_${task_id}`;
    const zipPath = path.join(__dirname, `${baseName}.zip`);
    
    downloadProgress.set(task_id, { status: "starting", progress: 0.0 });
    try {
        const info = await fetchInstagramViaSnapsave(url);
        const formats = info.video_formats || [];
        if (!formats.length) throw new Error("Tidak ada media.");
        
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 5 } });
        archive.pipe(output);
        
        for (let i = 0; i < formats.length; i++) {
            if (!formats[i].download_url) continue;
            downloadProgress.set(task_id, { status: "downloading", progress: i / formats.length });
            const imgRes = await axios.get(formats[i].download_url, { responseType: 'stream', timeout: 60000 });
            archive.append(imgRes.data, { name: `media_${i + 1}.${formats[i].ext}` });
        }
        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.finalize();
        });
        downloadProgress.set(task_id, { status: "completed", progress: 1.0 });
        
        const safeTitle = getSafeFilename(info.title, 60) || "instagram";
        res.on('finish', () => { cleanupFiles(baseName); downloadProgress.delete(task_id); });
        return res.download(zipPath, `${safeTitle}.zip`);
    } catch (e) {
        cleanupFiles(baseName);
        downloadProgress.delete(task_id);
        res.status(400).json({ detail: e.message });
    }
});

// --- YouTube Endpoints ---

function parseYtDlpProgress(dataStr, taskId) {
    if (!downloadProgress.has(taskId)) return;
    const match = dataStr.match(/\[download\]\s+([\d\.]+)%/);
    if (match && match[1]) {
        const prog = parseFloat(match[1]) / 100.0;
        const speedMatch = dataStr.match(/at\s+([^\s]+)\s+ETA/);
        const speed = speedMatch ? speedMatch[1] : "";
        const totalMatch = dataStr.match(/of\s+([^\s]+)\s+at/);
        const total = totalMatch ? totalMatch[1] : "";
        downloadProgress.set(taskId, { status: "downloading", progress: prog, speed, total });
    }
}

app.get('/info', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).json({ detail: "URL required" });
        const info = await youtubedl(url, { dumpSingleJson: true, noWarnings: true, quiet: true });
        
        const formats = info.formats || [];
        const videoFormats = [];
        const standardRes = new Set([144, 240, 360, 480, 720, 1080, 1440, 2160]);
        const resMap = new Map();

        formats.forEach(f => {
            if (f.height && standardRes.has(f.height) && f.vcodec !== 'none') {
                if (!resMap.has(f.height)) resMap.set(f.height, []);
                const priority = f.acodec !== 'none' ? 0 : 1;
                resMap.get(f.height).push({ format_id: f.format_id, priority });
            }
        });

        const sortedRes = Array.from(resMap.keys()).sort((a, b) => b - a);
        sortedRes.forEach(r => {
            const fmts = resMap.get(r).sort((a, b) => a.priority - b.priority);
            videoFormats.push({ resolution: `${r}p`, format_id: fmts[0].format_id });
        });

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            channel: info.uploader || info.channel || "",
            duration: info.duration || 0,
            video_formats: videoFormats,
            platform: "youtube"
        });
    } catch (e) {
        res.status(400).json({ detail: `Gagal mengambil info YouTube: ${e.message}` });
    }
});

app.get('/download/video', async (req, res) => {
    let { url, format_id = "best", task_id } = req.query;
    if (!task_id) task_id = crypto.randomUUID();
    
    if (activeTasks.has(task_id)) return res.status(408).json({ detail: "Timeout" });
    activeTasks.add(task_id);
    downloadProgress.set(task_id, { status: "starting", progress: 0.0 });
    
    const baseName = `temp_yt_${task_id}`;
    // Using mp4 extension to align with yt-dlp merge output
    const destPath = path.join(__dirname, `${baseName}.mp4`);

    try {
        const info = await youtubedl(url, { dumpSingleJson: true, noWarnings: true, quiet: true });
        const safeTitle = getSafeFilename(info.title, 60) || `youtube_${task_id}`;

        const subprocess = youtubedl.exec(url, {
            format: `${format_id}+bestaudio/best`,
            mergeOutputFormat: 'mp4',
            output: destPath,
            extractorArgs: 'youtube:player_client=ios,default',
            concurrentFragments: 8,
            httpChunkSize: '10M',
            noWarnings: true
        });

        subprocess.stdout.on('data', data => parseYtDlpProgress(data.toString(), task_id));
        await subprocess;

        downloadProgress.set(task_id, { status: "completed", progress: 1.0 });
        res.on('finish', () => { cleanupFiles(baseName); downloadProgress.delete(task_id); activeTasks.delete(task_id); });
        return res.download(destPath, `${safeTitle}.mp4`);
    } catch (e) {
        cleanupFiles(baseName);
        downloadProgress.delete(task_id);
        activeTasks.delete(task_id);
        res.status(400).json({ detail: e.message });
    }
});

app.get('/download/audio', async (req, res) => {
    let { url, task_id } = req.query;
    if (!task_id) task_id = crypto.randomUUID();
    
    if (activeTasks.has(task_id)) return res.status(408).json({ detail: "Timeout" });
    activeTasks.add(task_id);
    downloadProgress.set(task_id, { status: "starting", progress: 0.0 });
    
    const baseName = `temp_yt_${task_id}`;
    const destPath = path.join(__dirname, `${baseName}.m4a`);

    try {
        const info = await youtubedl(url, { dumpSingleJson: true, noWarnings: true, quiet: true });
        const safeTitle = getSafeFilename(info.title, 60) || `audio_${task_id}`;

        const subprocess = youtubedl.exec(url, {
            format: '140/m4a/bestaudio',
            output: destPath,
            extractorArgs: 'youtube:player_client=ios,default',
            concurrentFragments: 8,
            httpChunkSize: '10M',
            addMetadata: true,
            embedThumbnail: true,
            noWarnings: true
        });

        subprocess.stdout.on('data', data => parseYtDlpProgress(data.toString(), task_id));
        await subprocess;

        downloadProgress.set(task_id, { status: "completed", progress: 1.0 });
        res.on('finish', () => { cleanupFiles(baseName); downloadProgress.delete(task_id); activeTasks.delete(task_id); });
        return res.download(destPath, `${safeTitle}.m4a`);
    } catch (e) {
        cleanupFiles(baseName);
        downloadProgress.delete(task_id);
        activeTasks.delete(task_id);
        res.status(400).json({ detail: e.message });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
