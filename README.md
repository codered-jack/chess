# Chess — Stockfish 18

Modern chess GUI built with Next.js, powered by Stockfish 18.

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Stockfish Native Binary (local development)

For the strongest local engine, you need the native Stockfish 18 binary placed at:

```
engines/stockfish
```

### Download

Go to the official Stockfish releases page:

**[https://github.com/official-stockfish/Stockfish/releases/tag/sf_18](https://github.com/official-stockfish/Stockfish/releases/tag/sf_18)**

Download the correct build for your machine:

| OS | Chip | File to download |
|----|------|-----------------|
| macOS | Apple Silicon (M1/M2/M3) | `stockfish-macos-apple-silicon` |
| macOS | Intel | `stockfish-macos-x86-64-modern` |
| Linux | x86-64 | `stockfish-ubuntu-x86-64-modern` |
| Linux | ARM64 | `stockfish-ubuntu-arm64` |
| Windows | x86-64 | `stockfish-windows-x86-64-modern.exe` |

### Place the binary

After downloading and extracting:

```bash
# Move the binary into the engines folder
mv /path/to/downloaded/stockfish /path/to/this/repo/engines/stockfish

# Make it executable (macOS/Linux)
chmod +x engines/stockfish
```

### Verify it works

```bash
engines/stockfish
# should print: Stockfish 18 by the Stockfish developers ...
# type "quit" to exit
```

Then check the health endpoint while app is running:

```
GET http://localhost:3000/api/stockfish/health
```

Expected response:

```json
{ "ok": true, "mode": "local", "backend": "native" }
```

> **Note:** The native binary is in `.gitignore` — it will not be committed to GitHub since it exceeds GitHub's 100MB file limit.

---

## Engine backends

The app automatically picks the best available backend:

| Priority | Backend | When used |
|----------|---------|-----------|
| 1 | `native` | `engines/stockfish` binary present |
| 2 | `wasm-node` | WASM fallback from `engines/wasm/` |
| 3 | `asm-node` | ASM fallback (Vercel compatible) |

---

## Production with full native Stockfish (optional)

Vercel serverless cannot run native binaries. To get full Stockfish 18 strength in production:

1. Run this app on a Linux VM (Oracle, Fly.io, Render, Railway etc.) with native binary present.
2. Set env var in Vercel:

```
ENGINE_API_URL=https://your-engine-host.com
```

3. Vercel will then proxy all engine requests to your VM.

Verify:

```
GET https://your-vercel-app.vercel.app/api/stockfish/health
```

Expected: `{ "mode": "proxy", "ok": true, ... }`

---

## Notes

- Do **not** commit `engines/stockfish` — it is already in `.gitignore`.
- WASM fallback is always available as an automatic fallback (included via `stockfish` npm package).
- Sounds are in `public/sounds/`.
