const express = require('express')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3080

// Serve static files from marketing directory
app.use(express.static(__dirname, { maxAge: '1d', extensions: ['html'] }))

app.get('/about', (_req, res) => {
  res.sendFile(path.join(__dirname, 'about.html'))
})

app.get('/privacy-policy', (_req, res) => {
  res.sendFile(path.join(__dirname, 'privacy-policy.html'))
})

app.get('/terms-and-conditions', (_req, res) => {
  res.sendFile(path.join(__dirname, 'terms-and-conditions.html'))
})

// Alternate common legal slugs
app.get('/privacy', (_req, res) => {
  res.redirect(301, '/privacy-policy')
})

app.get('/terms', (_req, res) => {
  res.redirect(301, '/terms-and-conditions')
})

// Serve index.html for all routes (SPA-style)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`EDGEFOLIO marketing page running at http://localhost:${PORT}`)
})
