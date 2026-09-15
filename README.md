# athkarnfc

Mobile-responsive NFC audio player landing page.

Built with native HTML5, CSS3, and vanilla JavaScript — zero framework dependencies.

## Directory Structure

```
athkarnfc/
├── index.html            ← single-page audio player
├── assets/
│   └── audio/
│       ├── track1.mp3    ← دعاء السفر (Travel Prayer)
│       ├── track2.mp3    ← أذكار الصباح (Morning Remembrances)
│       └── track3.mp3    ← أذكار المساء (Evening Remembrances)
├── deploy/
│   └── deploy.sh         ← deploy script (GCP VM)
└── README.md
```

## How It Works

1. User taps an NFC tag → browser opens `https://yourdomain.com/`
2. Landing page shows 3 audio track buttons
3. Tap a button → native HTML5 audio player appears, playback starts
4. Tap another → current track stops and resets, new one plays (mutual exclusion)

## Prerequisites

- A GCP VM instance (Debian/Ubuntu) with a public IP and a domain pointing to it
- Nginx (recommended) or Apache installed on the VM
- Three audio files in MP3 or WAV format named `track1`, `track2`, `track3`

## Setup

1. Drop your `.mp3`/`.wav` files into `assets/audio/` following the naming above
2. ~~Edit `index.html` and update the three `src` paths in the `<audio>` tags if your filenames differ~~
3. Run the deploy script (assumes `gcloud` CLI and SSH key are configured):

```bash
bash deploy/deploy.sh
```

Or manually:

```bash
rsync -avz --delete ./ user@your-vm-ip:/var/www/athkarnfc/
```

Then configure Nginx:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/athkarnfc;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.(mp3|wav|ogg)$ {
        add_header Cache-Control "public, max-age=86400";
    }
}
```

Add an HTTPS redirect with Certbot (`sudo certbot --nginx`).

## NFC Tag Encoding

Encode your NFC tag with: `https://yourdomain.com/`

## Customization

- **Track names/labels** — edit the `.track-title` spans in `index.html`
- **Colors** — update the CSS custom properties in `index.html` (search for `#5856d6`, `#1a1a24`, etc.)
- **Dark/light mode** — both are supported via `prefers-color-scheme`

## Browser Compatibility

- iOS Safari (14+) — fully tested, onclick triggers audio
- Android Chrome — fully tested
- Desktop Chrome, Firefox, Safari — full support

## License

MIT
