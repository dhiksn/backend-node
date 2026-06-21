const { execSync } = require('child_process');

const SPOTISAVER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function spotisaverEncodeCtx(obj) {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function curlGet(url, headers) {
    const headerArgs = Object.entries(headers).map(([k,v]) => `-H "${k}: ${v}"`).join(' ');
    const cmd = `curl.exe -s -L ${headerArgs} "${url}"`;
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
}

function curlGetHeaders(url, headers) {
    const headerArgs = Object.entries(headers).map(([k,v]) => `-H "${k}: ${v}"`).join(' ');
    const cmd = `curl.exe -s -i -L ${headerArgs} "${url}"`;
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
}

async function run() {
    const rawRes1 = curlGetHeaders('https://spotisaver.net/en1', {
        'User-Agent': SPOTISAVER_UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
    });
    const cookies = {};
    rawRes1.split('\n').forEach(line => {
        if (line.toLowerCase().startsWith('set-cookie:')) {
            const x = line.substring(11).trim();
            const p = x.split(';')[0].trim();
            const eq = p.indexOf('=');
            if (eq > 0) cookies[p.slice(0, eq)] = p.slice(eq+1);
        }
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
    
    const sig1Res = curlGet(`https://spotisaver.net/api/get_signature.php?action=get_playlist&ctx=${encodeURIComponent(ctx1)}`, API_H);
    const sig1Data = JSON.parse(sig1Res);
    console.log("Sig1:", sig1Data);

    const plRes = curlGet(`https://spotisaver.net/api/get_playlist.php?url=${encodeURIComponent(cleanUrl)}&lang=en`, {
        ...API_H,
        'X-PT': sig1Data.token,
        'X-PE': String(sig1Data.exp)
    });
    const plData = JSON.parse(plRes);
    console.log("Playlist:", plData);
}

run().catch(console.error);
