const ogDesc = '254K likes, 833 comments - zo__glasss on June 15, 2026: "먹고먹고또먹고".';
let title = "Instagram Post";
let channel = "Instagram";
let description = ogDesc;

const match = ogDesc.match(/- ([a-zA-Z0-9._]+) on /);
if (match && match[1]) {
    const username = match[1];
    channel = `@${username}`;
    title = `Post by ${username}`;
}

const captionMatch = ogDesc.match(/: "([\s\S]*)"/);
if (captionMatch && captionMatch[1]) {
    let caption = captionMatch[1];
    if (caption.endsWith('"') || caption.endsWith('".')) {
        caption = caption.replace(/\"\.$/, '').replace(/\"$/, '');
    }
    description = caption;
}

console.log({ title, channel, description });

