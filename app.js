require('dotenv').config()

const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const quizData = require('./quiz-data')
const { createToken, requireAuth } = require('./middleware/auth')
const { connectToDatabase, getStorageMode } = require('./db')
const {
  createScore,
  createUser,
  findUserByEmail,
  getUserId,
  listLeaderboardPlayers,
  saveUser,
} = require('./store')

function sanitizeUser(user) {
  return {
    id: getUserId(user),
    name: user.name,
    email: user.email,
    bestScore: user.bestScore,
    gamesPlayed: user.gamesPlayed,
    totalScore: user.totalScore,
    totalCorrectAnswers: user.totalCorrectAnswers,
    lastPlayedAt: user.lastPlayedAt,
    createdAt: user.createdAt,
  }
}

function buildCorsOptions() {
  const allowedOrigins = (
    process.env.CLIENT_URLS ||
    'http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin not allowed by CORS'))
    },
  }
}

function validateAuthInput({ name, email, password }, isSignup) {
  if (isSignup && (!name || name.trim().length < 2)) {
    return 'Name must be at least 2 characters long.'
  }

  if (!email || !email.includes('@')) {
    return 'A valid email address is required.'
  }

  if (!password || password.length < 6) {
    return 'Password must be at least 6 characters long.'
  }

  return null
}

async function ensureDatabaseConnection(req, res, next) {
  try {
    await connectToDatabase()
    next()
  } catch (error) {
    next(error)
  }
}

const app = express()

app.use(cors(buildCorsOptions()))
app.use(express.json())

app.get('/', (req, res) => {
  res.json({
    message: 'Quiz backend is running',
    storageMode: getStorageMode(),
    endpoints: [
      '/api/quiz',
      '/api/auth/signup',
      '/api/auth/login',
      '/api/auth/me',
      '/api/scores',
      '/api/leaderboard',
    ],
  })
})

app.get('/api/quiz', (req, res) => {
  res.json({
    title: 'Precision Sprint',
    description:
      'A 30-question student edition with 20 easy, 6 medium, 4 hard, and 20 seconds per question.',
    questions: quizData,
  })
})

app.post('/api/auth/signup', ensureDatabaseConnection, async (req, res) => {
  const { name = '', email = '', password = '' } = req.body || {}
  const validationMessage = validateAuthInput(
    { name, email, password },
    true,
  )

  if (validationMessage) {
    res.status(400).json({ message: validationMessage })
    return
  }

  const normalizedEmail = email.trim().toLowerCase()
  const existingUser = await findUserByEmail(normalizedEmail)

  if (existingUser) {
    res.status(409).json({ message: 'An account with that email already exists.' })
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await createUser({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
  })

  res.status(201).json({
    token: createToken(user._id.toString()),
    user: sanitizeUser(user),
  })
})

app.post('/api/auth/login', ensureDatabaseConnection, async (req, res) => {
  const { email = '', password = '' } = req.body || {}
  const validationMessage = validateAuthInput(
    { name: 'player', email, password },
    false,
  )

  if (validationMessage) {
    res.status(400).json({ message: validationMessage })
    return
  }

  const normalizedEmail = email.trim().toLowerCase()
  const user = await findUserByEmail(normalizedEmail)

  if (!user) {
    res.status(401).json({ message: 'Invalid email or password.' })
    return
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash)

  if (!isPasswordValid) {
    res.status(401).json({ message: 'Invalid email or password.' })
    return
  }

  res.json({
    token: createToken(user._id.toString()),
    user: sanitizeUser(user),
  })
})

app.get('/api/auth/me', ensureDatabaseConnection, requireAuth, (req, res) => {
  res.json({
    user: sanitizeUser(req.user),
  })
})

app.post('/api/scores', ensureDatabaseConnection, requireAuth, async (req, res) => {
  const {
    score,
    correctCount,
    bestStreak,
    averageTime,
    totalQuestions,
  } = req.body || {}

  const scorePayload = {
    score: Number(score),
    correctCount: Number(correctCount),
    bestStreak: Number(bestStreak),
    averageTime: Number(averageTime),
    totalQuestions: Number(totalQuestions),
  }

  const hasInvalidField = Object.values(scorePayload).some(
    (value) => Number.isNaN(value) || value < 0,
  )

  if (hasInvalidField || scorePayload.totalQuestions < 1) {
    res.status(400).json({ message: 'Score payload is invalid.' })
    return
  }

  await createScore({
    userId: getUserId(req.user),
    ...scorePayload,
  })

  req.user.bestScore = Math.max(req.user.bestScore, scorePayload.score)
  req.user.gamesPlayed += 1
  req.user.totalScore += scorePayload.score
  req.user.totalCorrectAnswers += scorePayload.correctCount
  req.user.lastPlayedAt = new Date()
  await saveUser(req.user)

  res.status(201).json({
    message: 'Score submitted successfully.',
    user: sanitizeUser(req.user),
    isPersonalBest: req.user.bestScore === scorePayload.score,
  })
})

app.get('/api/leaderboard', ensureDatabaseConnection, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const players = await listLeaderboardPlayers(limit)

  res.json({
    players: players.map((player, index) => ({
      rank: index + 1,
      id: player._id.toString(),
      name: player.name,
      bestScore: player.bestScore,
      gamesPlayed: player.gamesPlayed,
      totalCorrectAnswers: player.totalCorrectAnswers,
      lastPlayedAt: player.lastPlayedAt,
    })),
  })
})

app.use((error, req, res, next) => {
  if (error.message === 'Origin not allowed by CORS') {
    res.status(403).json({ message: error.message })
    return
  }

  console.error(error)
  res.status(500).json({ message: 'Something went wrong on the server.' })
})

module.exports = app
