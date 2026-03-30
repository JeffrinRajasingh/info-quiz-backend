const mongoose = require('mongoose')

let connectionPromise = null
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 10000

function isMongoConnectionString(value) {
  return typeof value === 'string' && /^mongodb(\+srv)?:\/\//.test(value)
}

function getDatabaseOptions() {
  const configuredDbName = process.env.MONGODB_DB_NAME?.trim()
  const configuredTimeout = Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS)

  return {
    dbName: configuredDbName || undefined,
    serverSelectionTimeoutMS:
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
  }
}

async function connectToDatabase() {
  if (connectionPromise) {
    return connectionPromise
  }

  const mongoUri = process.env.MONGODB_URI?.trim()

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set. Add it to backend/.env before starting the server.')
  }

  if (!isMongoConnectionString(mongoUri)) {
    throw new Error(
      'MONGODB_URI must start with mongodb:// or mongodb+srv://. Use your MongoDB Atlas connection string in backend/.env.',
    )
  }

  const databaseOptions = getDatabaseOptions()
  const connectionLabel = mongoUri.startsWith('mongodb+srv://') ? 'MongoDB Atlas' : 'MongoDB'

  connectionPromise = mongoose
    .connect(mongoUri, databaseOptions)
    .then((mongooseInstance) => {
      const host = mongooseInstance.connection.host || 'unknown-host'
      const databaseName =
        mongooseInstance.connection.name || databaseOptions.dbName || 'default'

      console.log(`Connected to ${connectionLabel} (${host}/${databaseName})`)
      return mongooseInstance
    })
    .catch((error) => {
      connectionPromise = null

      throw new Error(
        `Database connection failed. Check MONGODB_URI, Atlas network access, and database user credentials. ${error.message}`,
      )
    })

  return connectionPromise
}

module.exports = {
  connectToDatabase,
}
