import sys
import json
import base64
import requests
import os

SPOTISAVER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

def _spotisaver_encode_ctx(obj: dict) -> str:
    raw = json.dumps(obj, separators=(',', ':')).encode('utf-8')
    b64 = base64.b64encode(raw).decode('ascii')
    return b64.replace('+', '-').replace('/', '_').rstrip('=')

def fetch_spotify_info(track_url: str):
    BASE = 'https://spotisaver.net'
    API_H = {
        'User-Agent': SPOTISAVER_UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': f'{BASE}/en1',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
    }
    clean = track_url.split('?')[0]

    s = requests.Session()

    s.get(f'{BASE}/en1', headers={
        'User-Agent': SPOTISAVER_UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
    }, timeout=15)

    ctx1 = _spotisaver_encode_ctx({'url': clean, 'lang': 'en'})
    sig1r = s.get(
        f'{BASE}/api/get_signature.php',
        params={'action': 'get_playlist', 'ctx': ctx1},
        headers=API_H, timeout=15,
    )
    if sig1r.status_code != 200:
        raise Exception(f"Signature step failed: HTTP {sig1r.status_code}")
    sig1 = sig1r.json()
    if not sig1.get('success') or not sig1.get('token'):
        raise Exception(f"Signature rejected: {sig1r.text[:200]}")

    plr = s.get(
        f'{BASE}/api/get_playlist.php',
        params={'url': clean, 'lang': 'en'},
        headers={**API_H, 'X-PT': sig1['token'], 'X-PE': str(sig1['exp'])},
        timeout=20,
    )
    if plr.status_code != 200:
        raise Exception(f"Track metadata failed HTTP {plr.status_code}: {plr.text[:200]}")
    pl_data = plr.json()
    tracks = pl_data.get('tracks') or []
    if not tracks:
        raise Exception("No track data returned from spotisaver")
    t = tracks[0]

    duration_ms = int(t.get('duration_ms') or 0)
    raw_img = t.get('image') or {}
    thumbnail = raw_img.get('url', '') if isinstance(raw_img, dict) else str(raw_img)

    ctx2 = _spotisaver_encode_ctx({
        'lang': 'en',
        'id': str(t.get('id', '')),
        'name': str(t.get('name', '')),
        'duration_ms': str(duration_ms),
    })
    sig2r = s.get(
        f'{BASE}/api/get_signature.php',
        params={'action': 'download_track', 'ctx': ctx2},
        headers=API_H, timeout=15,
    )
    if sig2r.status_code != 200:
        raise Exception(f"Download signature failed HTTP {sig2r.status_code}")
    sig2 = sig2r.json()
    if not sig2.get('token'):
        raise Exception(f"Download signature rejected: {sig2r.text[:200]}")

    sig_param = _spotisaver_encode_ctx({
        'token': sig2['token'],
        'exp': str(sig2['exp']),
    })

    cookies_dict = s.cookies.get_dict()
    cookie_str = '; '.join([f"{k}={v}" for k, v in cookies_dict.items()])
    dur_sec = duration_ms // 1000
    duration_str = f"{dur_sec // 60}:{str(dur_sec % 60).zfill(2)}" if dur_sec > 0 else ""
    artist = ', '.join(t.get('artists') or []) or 'Unknown'

    return {
        'title': str(t.get('name') or 'Unknown'),
        'artist': artist,
        'album': str(t.get('album') or ''),
        'durationStr': duration_str,
        'thumbnail': thumbnail,
        'track': t,
        'sigParam': sig_param,
        'cookies': cookie_str,
        '_session': s
    }

def download_spotify(track_url: str, dest_path: str):
    info = fetch_spotify_info(track_url)
    s = info['_session']
    
    payload = {
        'track': info['track'],
        'download_dir': 'downloads',
        'filename_tag': 'RAISAVER',
        'user_ip': '0.0.0.0',
        'is_premium': False,
        'lang': 'en',
    }
    
    API_H = {
        'User-Agent': SPOTISAVER_UA,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://spotisaver.net/en1',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/json',
    }
    
    url_req = f"https://spotisaver.net/api/download_track.php?sig={info['sigParam']}"
    
    res = s.post(url_req, json=payload, headers=API_H, stream=True, timeout=30)
    if res.status_code != 200:
        raise Exception(f"Download failed HTTP {res.status_code}")
        
    ct = res.headers.get('content-type', '')
    if 'audio' not in ct and 'mpeg' not in ct and 'octet' not in ct:
        raise Exception(f"Unexpected content-type: {ct} - {res.text[:100]}")
        
    with open(dest_path, 'wb') as f:
        for chunk in res.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
                
    return info

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python spotisaver.py info <url> OR python spotisaver.py download <url> <dest_path>")
        sys.exit(1)
        
    action = sys.argv[1]
    url = sys.argv[2]
    
    try:
        if action == 'info':
            info = fetch_spotify_info(url)
            del info['_session']
            print(json.dumps({'success': True, 'data': info}))
        elif action == 'download':
            dest_path = sys.argv[3]
            info = download_spotify(url, dest_path)
            del info['_session']
            print(json.dumps({'success': True, 'data': info}))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
