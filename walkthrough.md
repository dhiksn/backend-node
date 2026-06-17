# Node.js Backend Rewrite Completed

I have completely rewritten the backend from Python to a pure Node.js application to perfectly match your hosting provider's Pterodactyl NodeJS environment.

The new code is located in your laptop at:
[backend_node/](file:///c:/Users/andhika/Documents/yt_downloader/backend_node/)

## What changed?
1. **No Python needed**: The new backend runs entirely on Node.js using the `express` framework.
2. **Self-contained Dependencies**: It uses `youtube-dl-exec` and `ffmpeg-static` via NPM, so you don't have to install any external system dependencies manually on the host. Pterodactyl will automatically download the binaries.
3. **Identical API**: The endpoints (`/info`, `/download/video`, `/tiktok/download`, etc.) behave exactly like the old Python ones, so you **do not need to change anything on your CLI app**.

## Deployment Instructions

Since your Pterodactyl server is configured for Node.js, deployment will now be much smoother.

1. Go to your local folder `c:\Users\andhika\Documents\yt_downloader\backend_node\`.
2. Block all 3 files inside it ([package.json](file:///c:/Users/andhika/Documents/yt_downloader/backend_node/package.json), [index.js](file:///c:/Users/andhika/Documents/yt_downloader/backend_node/index.js), and [decrypt_snapsave.js](file:///c:/Users/andhika/Documents/yt_downloader/backend_node/decrypt_snapsave.js)) and jadikan `.zip`.
3. Buka tab **Files** di Pterodactyl, hapus file-file lama (jika ada), lalu upload `.zip` tersebut dan **Unarchive**.
4. Pindah ke tab **Startup**. Pastikan variabel **CMD_RUN** (biasanya di pojok kanan bawah) isinya adalah:
   `node index.js`
   *(Karena Pterodactyl akan otomatis membaca `package.json` dan menjalankan `npm install` untukmu).*
5. Kembali ke **Console** dan klik **Start**. 

> [!TIP]
> Pada *Start* pertama kali, prosesnya mungkin butuh waktu sekitar 1-2 menit karena `npm install` akan mendownload *binary* YT-DLP dan FFmpeg. Tunggu saja hingga muncul pesan `Server listening on port 5536`.
