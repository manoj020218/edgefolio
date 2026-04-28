# Icon Required

Place the following files here before running `npm run build:exe`:

| File | Size | Used by |
|---|---|---|
| `icon.ico` | 256×256 px (multi-size ICO) | Windows installer + taskbar |
| `icon.png` | 512×512 px PNG | Dev mode window icon |

## How to generate icon.ico from a PNG

1. Start with a 1024×1024 transparent PNG of the EDGEFOLIO logo
2. Use any of these tools:
   - **Online:** https://icoconvert.com (free, upload PNG → download ICO)
   - **CLI:** `imagemagick`: `convert logo.png -resize 256x256 icon.ico`
   - **electron-icon-builder**: `npx electron-icon-builder --input=logo.png --output=./`

## Temporary workaround (dev only)

If `icon.ico` / `icon.png` are missing, Electron falls back to its default icon.
The app will still run — only the taskbar icon will be the Electron logo.
Add real icons before building the production `.exe`.
