const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const express = require('express')
const fs = require('fs')
const https = require('https')
const http = require('http')
const { OAuth2Client } = require('google-auth-library')

const app = express()
const PORT = process.env.PORT || 3080

const BILLING_API_BASE = process.env.BILLING_API_BASE || 'https://iotsoft.in'
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null

app.use(express.json())

// Static files (HTML, CSS, etc.) from marketing dir
app.use(express.static(__dirname, { maxAge: '1h', extensions: ['html'] }))

// Lightweight JSON POST using built-in http/https — no axios dep needed.
function jsonPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const payload = JSON.stringify(body)
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => { raw += chunk })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) })
          } catch {
            resolve({ status: res.statusCode, body: raw })
          }
        })
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// POST /api/onboard — proxies the public self-serve trial signup to the billing platform.
// Kept server-side so the billing API base URL never has to be exposed to the browser
// and the request isn't subject to browser CORS restrictions.
app.post('/api/onboard', async (req, res) => {
  const { companyName, contactName, email, phone, agentCode } = req.body || {}
  if (!companyName || !contactName || !email || !phone) {
    return res.status(400).json({ error: 'companyName, contactName, email, and phone are required' })
  }

  try {
    const result = await jsonPost(`${BILLING_API_BASE}/api/edgefolio/signup`, {
      companyName,
      contactName,
      email,
      phone,
      agentCode: agentCode || undefined,
    })
    return res.status(result.status).json(result.body)
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach the trial signup service. Please try again later.' })
  }
})

// GET /api/onboard/google-config — tells the client whether Google Sign-In is available.
app.get('/api/onboard/google-config', (_req, res) => {
  res.json({ clientId: GOOGLE_CLIENT_ID || null })
})

// POST /api/onboard/google-verify — verifies a Google ID token server-side and returns the
// verified email/name so the onboarding form can autofill. Does not create any account —
// account creation still goes through the normal /api/onboard submit.
app.post('/api/onboard/google-verify', async (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: 'Google sign-in is not configured.' })
  }
  const { idToken } = req.body || {}
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' })
  }
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload() || {}
    if (!payload.email || payload.email_verified === false) {
      return res.status(401).json({ error: 'Could not verify a Google account email.' })
    }
    return res.json({ email: payload.email, name: payload.name || '' })
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Google credential.' })
  }
})

// Serve downloads directory
app.use('/downloads', express.static(path.join(__dirname, 'downloads')))

// Download route — serves the installer
app.get('/download', (_req, res) => {
  const exePath = path.join(__dirname, 'downloads', 'EdgeFolio-Setup.exe')
  if (fs.existsSync(exePath)) {
    res.download(exePath, 'EdgeFolio-Setup.exe')
  } else {
    res.status(503).send('Download temporarily unavailable. Please contact support on WhatsApp: +91 72402 26566')
  }
})

// Portable build — no installer wizard, just run the .exe directly
app.get('/download/portable', (_req, res) => {
  const exePath = path.join(__dirname, 'downloads', 'EdgeFolio-Portable.exe')
  if (fs.existsSync(exePath)) {
    res.download(exePath, 'EdgeFolio-Portable.exe')
  } else {
    res.status(503).send('Download temporarily unavailable. Please contact support on WhatsApp: +91 72402 26566')
  }
})

// Mobile companion app (Android) — signed release build, sideloaded (not on Play Store)
app.get('/download/apk', (_req, res) => {
  const apkPath = path.join(__dirname, 'downloads', 'EdgeFolio.apk')
  if (fs.existsSync(apkPath)) {
    res.download(apkPath, 'EdgeFolio.apk')
  } else {
    res.status(503).send('Download temporarily unavailable. Please contact support on WhatsApp: +91 72402 26566')
  }
})

// Clean URL routes for legal pages
app.get('/privacy-policy', (_req, res) => {
  res.sendFile(path.join(__dirname, 'privacy-policy.html'))
})

app.get('/terms-and-conditions', (_req, res) => {
  res.sendFile(path.join(__dirname, 'terms-and-conditions.html'))
})

// Short aliases
app.get('/privacy', (_req, res) => res.redirect(301, '/privacy-policy'))
app.get('/terms', (_req, res) => res.redirect(301, '/terms-and-conditions'))

// Catch-all → index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`EdgeFolio marketing running at http://localhost:${PORT}`)
})
