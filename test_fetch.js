const SPOTISAVER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function spotisaverEncodeCtx(obj) {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function run() {
    const res1 = await fetch('https://spotisaver.net/en1', {
        headers: {
            'User-Agent': SPOTISAVER_UA,
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
        }
    });

    const cookies = {};
    const setCookie = res1.headers.get('set-cookie') || '';
    // Undici joins multiple set-cookie with ', ' but let's just parse it naively
    setCookie.split(/,\s*(?=[A-Za-z0-9_]+=-)/).forEach(x => {
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
    
    const sig1Res = await fetch(`https://spotisaver.net/api/get_signature.php?action=get_playlist&ctx=${encodeURIComponent(ctx1)}`, { headers: API_H });
    const sig1Data = await sig1Res.json();
    console.log("Sig1:", sig1Data);

    const plRes = await fetch(`https://spotisaver.net/api/get_playlist.php?url=${encodeURIComponent(cleanUrl)}&lang=en`, {
        headers: {
            ...API_H,
            'X-PT': sig1Data.token,
            'X-PE': String(sig1Data.exp)
        }
    });
    const plData = await plRes.json();
    console.log("Playlist:", plData);
}

run().catch(console.error);
