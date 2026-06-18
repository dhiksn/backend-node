/**
 * PROJECT     : Spotify DL
 * AUTHOR      : dhiksn
 * CREATOR     : dhiksn
 * DESCRIPTION : Download Spotify songs 
 * USAGE       : node spotify.js "https://open.spotify.com/track/xxx"
 **/

const https = require('https');
const fs = require('fs');

class SpotifyDownloader {
    constructor() {
        this.apiUrl = 'musicfab.io';
        this.endpoint = '/api/spotify';
    }

    async download(trackUrl) {
        const payload = { url: trackUrl };
        const postData = JSON.stringify(payload);

        return new Promise((resolve) => {
            const options = {
                hostname: this.apiUrl,
                port: 443,
                path: this.endpoint,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const metadata = json.data?.metadata;

                        if (metadata?.download) {
                            resolve({
                                success: true,
                                author: 'dhiksn',
                                creator: 'dhiksn',
                                data: {
                                    title: metadata.name,
                                    artist: metadata.artist,
                                    album: metadata.album,
                                    duration: metadata.duration,
                                    cover_url: metadata.image,
                                    download_url: metadata.download
                                }
                            });
                        } else {
                            resolve({
                                success: false,
                                author: 'dhiksn',
                                creator: 'dhiksn',
                                error: 'Download URL not found'
                            });
                        }
                    } catch(e) {
                        resolve({
                            success: false,
                            author: 'dhiksn',
                            creator: 'dhiksn',
                            error: e.message
                        });
                    }
                });
            });
            req.on('error', (error) => {
                resolve({
                    success: false,
                    author: 'dhiksn',
                    creator: 'dhiksn',
                    error: error.message
                });
            });
            req.write(postData);
            req.end();
        });
    }

    async downloadAndSave(trackUrl, filename) {
        const result = await this.download(trackUrl);
        if (!result.success) return result;

        return new Promise((resolve) => {
            const file = fs.createWriteStream(filename);
            const request = https.get(result.data.download_url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve({
                        success: true,
                        author: 'dhiksn',
                        creator: 'dhiksn',
                        data: {
                            filename: filename,
                            title: result.data.title,
                            artist: result.data.artist,
                            download_url: result.data.download_url
                        }
                    });
                });
            });
            request.on('error', (error) => {
                resolve({
                    success: false,
                    author: 'dhiksn',
                    creator: 'dhiksn',
                    error: error.message
                });
            });
        });
    }
}

async function main() {
    const args = process.argv.slice(2);
    const spotify = new SpotifyDownloader();

    if (args.length === 0) {
        console.log(JSON.stringify({
            success: false,
            author: 'dhiksn',
            creator: 'dhiksn',
            error: 'Usage: node spotify.js "https://open.spotify.com/track/xxxxx" [--save filename.mp3]'
        }, null, 2));
        process.exit(0);
    }

    const trackUrl = args[0];
    const saveIndex = args.indexOf('--save');
    const filename = saveIndex !== -1 ? args[saveIndex + 1] : null;

    if (filename) {
        const result = await spotify.downloadAndSave(trackUrl, filename);
        console.log(JSON.stringify(result, null, 2));
    } else {
        const result = await spotify.download(trackUrl);
        console.log(JSON.stringify(result, null, 2));
    }
}

main();