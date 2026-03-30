const mongoose = require('mongoose')

let connectionPromise = null
let storageMode = 'database'
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 30000

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

function createDatabaseUnavailableError(message) {
  const error = new Error(message)
  error.code = 'DATABASE_UNAVAILABLE'
  error.status = 503
  return error
}

function enableMemoryStore(reason) {
  storageMode = 'memory'
  connectionPromise = null

  console.warn(
    `Database connection unavailable. Using the in-memory fallback store instead. ${reason}`,
  )
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

async function connectToDatabase({ allowMemoryFallback = shouldUseMemoryFallback() } = {}) {
  if (connectionPromise) {
    return connectionPromise
  }

  const mongoUri = process.env.MONGODB_URI?.trim()

  if (!mongoUri) {
    if (allowMemoryFallback) {
      enableMemoryStore('MONGODB_URI is not configured for this deployment.')
      return null
    }

    throw createDatabaseUnavailableError(
      'Database is not configured for this deployment. Add MONGODB_URI before using account features.',
    )
  }

  if (!isMongoConnectionString(mongoUri)) {
    if (allowMemoryFallback) {
      enableMemoryStore('MONGODB_URI is not a valid MongoDB connection string.')
      return null
    }

    throw createDatabaseUnavailableError(
      'Database configuration is invalid for this deployment. Update MONGODB_URI and try again.',
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

      if (allowMemoryFallback) {
        enableMemoryStore(
          `MongoDB Atlas could not be reached from this environment. ${error.message}`,
        )
        return null
      }

      throw createDatabaseUnavailableError(
        `Database connection failed. Check MongoDB Atlas network access and database credentials. ${error.message}`,
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
