require('dotenv').config()

const app = require('./app')
const { connectToDatabase } = require('./db')

const PORT = Number(process.env.PORT) || 5000

async function startServer(port = PORT) {
  await connectToDatabase()

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
