const axios = require('axios');

const SPOTISAVER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function spotisaverEncodeCtx(obj) {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function run() {
    const s = axios.create({
        baseURL: 'https://spotisaver.net',
        headers: {
            'User-Agent': SPOTISAVER_UA,
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
        }
    });

    const res1 = await s.get('/en1');
    const cookies = {};
    (res1.headers['set-cookie'] || []).forEach(x => {
        const p = x.split(';')[0].trim();
        const eq = p.indexOf('=');
        if (eq > 0) cookies[p.slice(0, eq)] = p.slice(eq+1);
    });
    const cookieStr = Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join('; ');
    console.log("Cookies:", cookieStr);

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

    const cleanUrl = 'https://open.spotify.com/track/67gYAheGPb06KwCkuAaHbF';
    const ctx1 = spotisaverEncodeCtx({ url: cleanUrl, lang: 'en' });
    
    const sig1Res = await axios.get('/api/get_signature.php', {
        baseURL: 'https://spotisaver.net',
        params: { action: 'get_playlist', ctx: ctx1 },
        headers: API_H
    });
    console.log("Sig1:", sig1Res.data);

    const plRes = await axios.get('/api/get_playlist.php', {
        baseURL: 'https://spotisaver.net',
        params: { url: cleanUrl, lang: 'en' },
        headers: {
            ...API_H,
            'X-PT': sig1Res.data.token,
            'X-PE': String(sig1Res.data.exp)
        }
    });
    console.log("Playlist:", plRes.data);
}

run().catch(e => console.error(e.response ? e.response.data : e.message));
