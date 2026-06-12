# HUM — Humble Utility Machine

A modern, minimalist AI chat application built with vanilla JavaScript, Supabase authentication, and the FreeModel API.

Live Demo: https://hum-self.vercel.app

---

## Project Overview

HUM is a sleek chat interface that lets users interact with AI models through a beautiful, responsive web application. It features real-time streaming responses, customizable system prompts, and a clean, dark-themed design.

### Key Characteristics
- Humble & Helpful — Designed to assist without pretension
- Simple & Fast — Minimal dependencies, vanilla JavaScript only
- Secure — Supabase OAuth authentication
- Flexible — Multiple AI model options
- Persistent — Chat history saved locally

---

## Project Structure

```
HUM/
├── index.html          # Main single-page application
├── api/
│   └── chat.js         # Vercel Edge Function API endpoint
├── package.json        # Project configuration
└── README.md           # This file
```

---

## File Documentation

### index.html (45 KB)

The main frontend application — a complete single-page app combining HTML, CSS, and JavaScript.

**What it does:**
- Dark theme UI with custom CSS design system
- Google OAuth login via Supabase
- Real-time chat interface with typewriter effect
- AI model selector (4 models available)
- System prompt customization modal
- Markdown rendering in messages
- Syntax highlighting for code blocks
- Copy-to-clipboard for messages & code
- User account menu with profile & logout
- Message history persisted to localStorage
- Responsive design (max-width: 880px)

**Technologies used:**
- Supabase JS SDK (authentication & session management)
- Highlight.js (syntax highlighting)
- Custom CSS with CSS variables
- Event streaming for AI responses

**Main Components:**
- Login screen with Google OAuth
- Header with logo, model selector, settings, & user menu
- Messages container with user & AI bubbles
- Empty state with suggestions
- Settings modal for system prompt
- Footer with message input & send/stop buttons

---

### api/chat.js (3.6 KB)

Backend API endpoint deployed as a Vercel Edge Function.

**What it does:**
1. Verifies Supabase access tokens
2. Routes requests to FreeModel API
3. Forwards AI responses as server-sent events
4. Checks required environment variables

**Endpoints:**
- `POST /api/chat` — Send message and get AI response
- `OPTIONS /api/chat` — CORS preflight support

**Request format:**
```json
{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "model": "gpt-5.4-mini",
  "systemPrompt": "You are a helpful assistant..."
}
```

**Security:**
- Requires valid Supabase token in `Authorization: Bearer` header
- Validates environment variables before processing
- 6-second timeout for Supabase verification
- 45-second timeout for upstream API calls

---

### package.json (50 bytes)

Minimal Node.js project configuration.

```json
{
  "name": "hum-chatbot",
  "version": "1.0.0"
}
```

Currently no runtime dependencies — everything uses vanilla JavaScript.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│             index.html (Frontend)                   │
│  Chat UI + Message History + Settings Modal        │
│  (Supabase Auth, localStorage persistence)         │
└──────────────────┬──────────────────────────────────┘
                   │ POST /api/chat
                   │ Authorization: Bearer {token}
                   │ Payload: {messages, model, systemPrompt}
                   ▼
        ┌──────────────────────┐
        │   api/chat.js        │
        │ (Vercel Edge Fn)     │
        │                      │
        │ 1. Verify token      │
        │ 2. Validate env vars │
        │ 3. Proxy to FreeModel│
        │ 4. Stream response   │
        └──────────┬───────────┘
                   │ HTTPS
                   ▼
        ┌──────────────────────┐
        │  FreeModel API       │
        │ (OpenAI-compatible)  │
        │ Chat completion      │
        │ with streaming       │
        └──────────────────────┘

Authentication: Supabase OAuth (Google)
Storage: Supabase (session tokens), Browser localStorage (chat history)
```

---

## Setup & Deployment

### Prerequisites
- Supabase project with Google OAuth configured
- FreeModel API key (https://freemodel.dev)
- Vercel account (for deployment)

### Environment Variables

Set these in your Vercel project:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
FREEMODEL_API_KEY=your_api_key_here
```

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/kenshinhumble/HUM.git
   cd HUM
   ```

2. Update Supabase credentials in index.html:
   - Find `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   - Replace with your project values

3. Run a local server:
   ```bash
   python3 -m http.server 8000
   # or
   npx http-server
   ```

4. Open in browser:
   ```
   http://localhost:8000
   ```

### Deploy to Vercel

1. Connect repository:
   - Go to https://vercel.com/new
   - Import the GitHub repository

2. Set environment variables:
   - Project Settings → Environment Variables
   - Add the three required variables above

3. Deploy:
   - Vercel automatically detects `/api` functions
   - `chat.js` will be deployed as an Edge Function

---

## User Features

### Chat Interface
- Send Messages — Type and press Enter (or click Send button)
- Stop Generation — Click Stop button while AI is responding
- Copy Message — Hover over message and click Copy
- Copy Code — Click Copy button on code blocks

### Model Selection
Four AI models available:
- gpt-5.4-mini — Fast, best for quick responses
- gpt-5.4 — Balanced, good general-purpose model
- gpt-5.5 — Powerful, most capable
- gpt-5.3-codex — Specialized for programming tasks

### System Prompt
Customize AI behavior by clicking the Settings icon, editing the system prompt, and saving your changes.

### Chat History
- Automatically saved to browser localStorage
- Persists across sessions
- Clear with the Clear button anytime

### Account
- Login with Google via OAuth
- View email in user menu
- Logout anytime

---

## Design System

### Color Palette

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg` | #07080f | Main background |
| `--surface` | #0c0e1a | Cards & panels |
| `--accent` | #2dd4bf | Cyan, primary interactive |
| `--text` | #e2e8f0 | Primary text |
| `--muted` | #64748b | Secondary text |
| `--danger` | #f87171 | Error states |

### Border Radius Scale

```css
--r-xs:  4px
--r-sm:  8px
--r-md:  14px
--r-lg:  20px
--r-xl:  26px
```

---

## Security Considerations

1. Token Verification — Every API request validates Supabase session token
2. Rate Limiting — FreeModel API has built-in rate limiting
3. CORS — Frontend allowed to * (change in production for security)
4. No Sensitive Data — API keys never exposed to client
5. Timeout Protection — 6s & 45s timeouts prevent hanging connections

---

## Dependencies

### Frontend
- Supabase JS SDK (auth & realtime)
- Highlight.js (syntax highlighting via CDN)
- Google Fonts (Inter, JetBrains Mono)

### Backend
- Node.js (Edge Runtime)
- Vercel Edge Functions
- Fetch API (native)

---

## Troubleshooting

### "Env var belum diset di Vercel"
Verify environment variables are set in Vercel project settings for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `FREEMODEL_API_KEY`.

### "Belum login. Silakan login terlebih dahulu"
No Authorization header found. Ensure you're logged in via Google OAuth first.

### "Sesi login tidak valid atau sudah habis"
Token expired. Log out and log in again to refresh your session.

### "FreeModel API timeout"
API took too long to respond. Try again or switch to a faster model.

---

## License

This project is open source. Feel free to fork, modify, and deploy your own version.

---

## Credits

- HUM Design — kenshinhumble
- AI API — FreeModel.dev
- Auth — Supabase
- Hosting — Vercel
- Syntax Highlighting — Highlight.js
- Fonts — Google Fonts

---

## Useful Links

- Live Demo: https://hum-self.vercel.app
- GitHub: https://github.com/kenshinhumble/HUM
- Supabase: https://supabase.com
- FreeModel API: https://freemodel.dev
- Vercel: https://vercel.com

---

Made with love by kenshinhumble
