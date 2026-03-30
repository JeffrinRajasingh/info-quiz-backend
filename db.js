const mongoose = require('mongoose')

let connectionPromise = null
let storageMode = 'database'
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 10000

function isMongoConnectionString(value) {
  return typeof value === 'string' && /^mongodb(\+srv)?:\/\//.test(value)
}

function isTruthy(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function shouldUseMemoryFallback() {
  if (process.env.ALLOW_MEMORY_FALLBACK !== undefined) {
    return isTruthy(process.env.ALLOW_MEMORY_FALLBACK)
  }

  return process.env.VERCEL === '1'
}

function enableMemoryStore(reason) {
  storageMode = 'memory'
  connectionPromise = Promise.resolve(null)

  console.warn(
    `Database connection unavailable. Using the in-memory fallback store instead. ${reason}`,
  )

  return connectionPromise
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
  if (storageMode === 'memory' && connectionPromise) {
    return connectionPromise
  }

  if (connectionPromise) {
    return connectionPromise
  }

  const mongoUri = process.env.MONGODB_URI?.trim()

  if (!mongoUri) {
    if (shouldUseMemoryFallback()) {
      return enableMemoryStore('MONGODB_URI is not configured for this deployment.')
    }

    throw new Error('MONGODB_URI is not set. Add it to backend/.env before starting the server.')
  }

  if (!isMongoConnectionString(mongoUri)) {
    if (shouldUseMemoryFallback()) {
      return enableMemoryStore('MONGODB_URI is not a valid MongoDB connection string.')
    }

    throw new Error(
      'MONGODB_URI must start with mongodb:// or mongodb+srv://. Use your MongoDB Atlas connection string in backend/.env.',
    )
  }

  const databaseOptions = getDatabaseOptions()
  const connectionLabel = mongoUri.startsWith('mongodb+srv://') ? 'MongoDB Atlas' : 'MongoDB'

  connectionPromise = mongoose
    .connect(mongoUri, databaseOptions)
    .then((mongooseInstance) => {
      storageMode = 'database'

      const host = mongooseInstance.connection.host || 'unknown-host'
      const databaseName =
        mongooseInstance.connection.name || databaseOptions.dbName || 'default'

      console.log(`Connected to ${connectionLabel} (${host}/${databaseName})`)
      return mongooseInstance
    })
    .catch((error) => {
      connectionPromise = null

      if (shouldUseMemoryFallback()) {
        return enableMemoryStore(
          `MongoDB Atlas could not be reached from this environment. ${error.message}`,
        )
      }

      throw new Error(
        `Database connection failed. Check MONGODB_URI, Atlas network access, and database user credentials. ${error.message}`,
      )
    })

  return connectionPromise
}

module.exports = {
  connectToDatabase,
  getStorageMode() {
    return storageMode
  },
  isMemoryStoreEnabled() {
    return storageMode === 'memory'
  },
}
