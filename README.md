# HUM — Humble Utility Machine

A modern, minimalist AI chat application built with vanilla JavaScript, Supabase authentication, and the FreeModel API.

🌐 **Live Demo:** https://hum-self.vercel.app

---

## 📚 Project Overview

**HUM** is a sleek chat interface that lets users interact with AI models through a beautiful, responsive web application. It features real-time streaming responses, customizable system prompts, model selection, and full conversation history persistence.

### Key Characteristics
- **Humble & Helpful** — Designed to assist without pretension
- **Simple & Fast** — Minimal dependencies, vanilla JavaScript
- **Secure** — Supabase OAuth authentication
- **Flexible** — Multiple AI model options
- **Persistent** — Chat history saved locally

---

## 📁 Project Structure

```
HUM/
├── index.html          # Main single-page application
├── api/
│   └── chat.js         # Vercel Edge Function API endpoint
├── package.json        # Project configuration
└── README.md           # This file
```

---

## 📄 File Documentation

### **index.html** (45 KB)
**The main frontend application** — A complete single-page app combining HTML, CSS, and JavaScript.

**Features:**
- 🎨 Dark theme UI with custom CSS design system
- 🔐 Google OAuth login via Supabase
- 💬 Real-time chat interface with typewriter effect
- 🤖 AI model selector (4 models available)
- ⚙️ System prompt customization modal
- 📝 Markdown rendering in messages
- 🎨 Syntax highlighting for code blocks
- 📋 Copy-to-clipboard for messages & code
- 👤 User account menu with profile & logout
- 💾 Message history persisted to localStorage
- 📱 Responsive design (max-width: 880px)

**Key Technologies:**
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

### **api/chat.js** (3.6 KB)
**Backend API endpoint** deployed as a Vercel Edge Function.

**Responsibilities:**
1. **Authentication** — Verifies Supabase access tokens
2. **Proxy** — Routes requests to FreeModel API
3. **Streaming** — Forwards AI responses as server-sent events
4. **Validation** — Checks required environment variables

**Endpoints:**
- `POST /api/chat` — Send message and get AI response
- `OPTIONS /api/chat` — CORS preflight support

**Request Format:**
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

### **package.json** (50 bytes)
Minimal Node.js project configuration.

```json
{
  "name": "hum-chatbot",
  "version": "1.0.0"
}
```

**Current Status:** No runtime dependencies (vanilla JS only)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│             index.html (Frontend)                   │
│  ┌────────────────────────────────────────────────┐ │
│  │  Chat UI + Message History + Settings Modal    │ │
│  │  (Supabase Auth, localStorage persistence)     │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────┘
                   │ POST /api/chat
                   ├─ Authorization: Bearer {token}
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
        │                      │
        │ Chat completion      │
        │ with streaming       │
        └──────────────────────┘

Authentication: Supabase OAuth (Google)
Storage: Supabase (session tokens), Browser localStorage (chat history)
```

---

## 🚀 Setup & Deployment

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

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kenshinhumble/HUM.git
   cd HUM
   ```

2. **Update Supabase credentials in index.html:**
   - Find `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   - Replace with your project values

3. **Run a local server:**
   ```bash
   python3 -m http.server 8000
   # or
   npx http-server
   ```

4. **Open in browser:**
   ```
   http://localhost:8000
   ```

### Deploy to Vercel

1. **Connect repository:**
   - Go to https://vercel.com/new
   - Import the GitHub repository

2. **Set environment variables:**
   - Project Settings → Environment Variables
   - Add the three required variables above

3. **Deploy:**
   - Vercel automatically detects `/api` functions
   - `chat.js` will be deployed as an Edge Function

---

## 💬 User Features

### Chat Interface
- **Send Messages** — Type and press Enter (or click Send button)
- **Stop Generation** — Click Stop button while AI is responding
- **Copy Message** — Hover over message and click Copy
- **Copy Code** — Click Copy button on code blocks

### Model Selection
Four AI models available:
- **gpt-5.4-mini** (⚡ Fast) — Best for quick responses
- **gpt-5.4** (⚖️ Balanced) — Default, good balance
- **gpt-5.5** (💪 Powerful) — Most capable
- **gpt-5.3-codex** (💻 Code) — Specialized for programming

### System Prompt
Customize AI behavior:
1. Click ⚙️ Settings icon
2. Edit the system prompt
3. Click Save

### Chat History
- Automatically saved to browser localStorage
- Persists across sessions
- Clear with 🗑️ Clear button

### Account
- Login with Google via 🔐 OAuth
- View email in user menu
- Logout anytime

---

## 🎨 Design System

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

## 🔐 Security Considerations

1. **Token Verification** — Every API request validates Supabase session token
2. **Rate Limiting** — FreeModel API has built-in rate limiting (disabled in current config)
3. **CORS** — Frontend allowed to `*` (change in production)
4. **No Sensitive Data** — API keys never exposed to client
5. **Timeout Protection** — 6s & 45s timeouts prevent hanging connections

---

## 📦 Dependencies

### Frontend
- **Supabase JS SDK** (auth & realtime)
- **Highlight.js** (syntax highlighting via CDN)
- **Google Fonts** (Inter, JetBrains Mono)

### Backend
- **Node.js** (Edge Runtime)
- **Vercel Edge Functions**
- **Fetch API** (native)

---

## 🐛 Troubleshooting

### "Env var belum diset di Vercel"
**Solution:** Verify environment variables are set in Vercel project settings for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `FREEMODEL_API_KEY`.

### "Belum login. Silakan login terlebih dahulu"
**Solution:** No Authorization header found. Ensure you're logged in via Google OAuth first.

### "Sesi login tidak valid atau sudah habis"
**Solution:** Token expired. Log out and log in again to refresh your session.

### "FreeModel API timeout"
**Solution:** API took too long to respond. Try again or switch to a faster model.

---

## 📝 License

This project is open source. Feel free to fork, modify, and deploy your own version.

---

## 🙏 Credits

- **HUM Design** — kenshinhumble
- **AI API** — FreeModel.dev
- **Auth** — Supabase
- **Hosting** — Vercel
- **Syntax Highlighting** — Highlight.js
- **Fonts** — Google Fonts

---

## 🔗 Useful Links

- **Live Demo:** https://hum-self.vercel.app
- **GitHub:** https://github.com/kenshinhumble/HUM
- **Supabase:** https://supabase.com
- **FreeModel API:** https://freemodel.dev
- **Vercel:** https://vercel.com

---

**Made with ❤️ by kenshinhumble**
