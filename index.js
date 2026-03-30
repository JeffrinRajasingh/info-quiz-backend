require('dotenv').config()

const { createApp } = require('./app')
const { connectToDatabase } = require('./db')

const PORT = Number(process.env.PORT) || 5000

async function startServer(port = PORT) {
  await connectToDatabase()

  const app = createApp()
  return app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)
  })
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = {
  startServer,
}
