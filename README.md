# HUM

Chat app dengan AI. Login Google, pilih model, ketik pesan, dapat jawaban. Riwayat tersimpan di browser.

Live: https://hum-self.vercel.app

---

## Apa itu HUM?

Basically ini aplikasi chat sederhana. Frontend-nya satu file HTML (45KB) yang handle semua UI dan logic. Backend-nya kecil doang, cuma proxy ke FreeModel API.

Kenapa? Pengen bikin sesuatu yang cepat, simple, dan bisa dipakai langsung tanpa setup ribet.

---

## Struktur

```
HUM/
├── index.html
├── api/
│   └── chat.js
├── package.json
└── README.md
```

---

## Features

- Chat dengan AI models
- Login pake Google
- Bisa ganti-ganti model AI
- Customize system prompt
- Dark theme
- Riwayat tersimpan di browser
- Code syntax highlighting

---

## Setup

### Prerequisites
- Supabase project (dengan Google OAuth)
- API key dari FreeModel
- Vercel account

### Local

1. Clone:
   ```bash
   git clone https://github.com/kenshinhumble/HUM.git
   cd HUM
   ```

2. Update Supabase credentials di `index.html`

3. Jalankan:
   ```bash
   python3 -m http.server 8000
   ```

4. Buka `http://localhost:8000`

### Deploy

1. Push ke GitHub
2. Connect di Vercel
3. Set environment variables
4. Deploy

---

## Stack

- Frontend: Vanilla JS, Supabase JS SDK, Highlight.js
- Backend: Vercel Edge Function
- Auth: Supabase + Google OAuth
- AI: FreeModel API

---

## Models

- gpt-5.4-mini
- gpt-5.4
- gpt-5.5
- gpt-5.3-codex

---

## License

Open source. Fork mau apa terserah.

---

Made by kenshinhumble
