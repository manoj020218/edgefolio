const express = require('express')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3080

// Serve static files from current directory
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }))

// Serve index.html for all routes (SPA-style)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`EDGEFOLIO marketing page running at http://localhost:${PORT}`)
})
