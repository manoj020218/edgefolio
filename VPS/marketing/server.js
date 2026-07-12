const express = require('express')
const path = require('path')
const fs = require('fs')

const app = express()
const PORT = process.env.PORT || 3080

// Static files (HTML, CSS, etc.) from marketing dir
app.use(express.static(__dirname, { maxAge: '1h', extensions: ['html'] }))

// Serve downloads directory
app.use('/downloads', express.static(path.join(__dirname, 'downloads')))

// Download route — serves local .exe if uploaded, else redirects to GitHub Releases
app.get('/download', (_req, res) => {
  const exePath = path.join(__dirname, 'downloads', 'EdgeFolio-Setup.exe')
  if (fs.existsSync(exePath)) {
    res.download(exePath, 'EdgeFolio-Setup.exe')
  } else {
    res.redirect(302, 'https://github.com/manoj020218/edgefolio/releases')
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
