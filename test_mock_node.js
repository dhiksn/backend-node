const https = require('http');

const SPOTISAVER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function spotisaverEncodeCtx(obj) {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function run() {
    // 1. Session
    const cookies = await new Promise((resolve) => {
        https.get({
            hostname: 'localhost', port: 9999, path: '/en1',
            headers: {
                'User-Agent': SPOTISAVER_UA,
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
            }
        }, res => {
            res.resume();
            const c = {};
            (res.headers['set-cookie'] || []).forEach(x => {
                const p = x.split(';')[0].trim();
                const eq = p.indexOf('=');
                if (eq>0) c[p.slice(0,eq)] = p.slice(eq+1);
            });
            resolve(c);
        });
    });
    
    console.log("Cookies:", cookies);
    const cookieStr = Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join('; ');

    const API_H = {
        'User-Agent': SPOTISAVER_UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://spotisaver.net/en1',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Cookie': cookieStr,
    };

    // 2. Signature
    const cleanUrl = 'https://open.spotify.com/track/67gYAheGPb06KwCkuAaHbF';
    const ctx1 = spotisaverEncodeCtx({ url: cleanUrl, lang: 'en' });
    const sig1Res = await new Promise((resolve) => {
        https.get({
            hostname: 'localhost', port: 9999,
            path: `/api/get_signature.php?action=get_playlist&ctx=${encodeURIComponent(ctx1)}`,
            headers: API_H
        }, res => {
            let data = Buffer.alloc(0);
            res.on('data', chunk => data = Buffer.concat([data, chunk]));
            res.on('end', () => {
                resolve(JSON.parse(data.toString()));
            });
        });
    });
    console.log("Sig1:", sig1Res);

    // 3. Track
    const plPath = `/api/get_playlist.php?url=${encodeURIComponent(cleanUrl)}&lang=en`;
    const plRes = await new Promise((resolve) => {
        https.get({
            hostname: 'localhost', port: 9999, path: plPath,
            headers: {
                ...API_H,
                'X-PT': sig1Res.token,
                'X-PE': String(sig1Res.exp)
            }
        }, res => {
            let data = Buffer.alloc(0);
            res.on('data', chunk => data = Buffer.concat([data, chunk]));
            res.on('end', () => {
                resolve(JSON.parse(data.toString()));
            });
        });
    });
    console.log("Playlist:", plRes);
}

run().catch(console.error);
