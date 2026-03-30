const crypto = require('crypto')

const User = require('./models/User')
const Score = require('./models/Score')
const { isMemoryStoreEnabled } = require('./db')

function getMemoryStore() {
  if (!global.__INFO_QUIZ_MEMORY_STORE__) {
    global.__INFO_QUIZ_MEMORY_STORE__ = {
      users: [],
      scores: [],
    }
  }

  return global.__INFO_QUIZ_MEMORY_STORE__
}

function getUserId(user) {
  if (!user) {
    return ''
  }

  return String(user._id ?? user.id ?? '')
}

function cloneMemoryUser(user) {
  return {
    ...user,
    _id: String(user._id),
  }
}

async function findUserByEmail(email) {
  if (!isMemoryStoreEnabled()) {
    return User.findOne({ email })
  }

  const { users } = getMemoryStore()
  return users.find((user) => user.email === email) || null
}

async function findUserById(userId) {
  if (!isMemoryStoreEnabled()) {
    return User.findById(userId)
  }

  const { users } = getMemoryStore()
  return users.find((user) => getUserId(user) === String(userId)) || null
}

async function createUser({ name, email, passwordHash }) {
  if (!isMemoryStoreEnabled()) {
    return User.create({
      name,
      email,
      passwordHash,
    })
  }

  const { users } = getMemoryStore()
  const timestamp = new Date()
  const user = {
    _id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    bestScore: 0,
    gamesPlayed: 0,
    totalScore: 0,
    totalCorrectAnswers: 0,
    lastPlayedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  users.push(user)
  return cloneMemoryUser(user)
}

async function saveUser(user) {
  if (!isMemoryStoreEnabled()) {
    return user.save()
  }

  const { users } = getMemoryStore()
  const existingUser = users.find((entry) => getUserId(entry) === getUserId(user))

  if (!existingUser) {
    return null
  }

  Object.assign(existingUser, {
    ...user,
    _id: getUserId(existingUser),
    updatedAt: new Date(),
  })

  return cloneMemoryUser(existingUser)
}

async function createScore({ userId, ...scorePayload }) {
  if (!isMemoryStoreEnabled()) {
    return Score.create({
      user: userId,
      ...scorePayload,
    })
  }

  const { scores } = getMemoryStore()
  const timestamp = new Date()
  const score = {
    _id: crypto.randomUUID(),
    user: String(userId),
    ...scorePayload,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  scores.push(score)
  return score
}

async function listLeaderboardPlayers(limit) {
  if (!isMemoryStoreEnabled()) {
    return User.find({ gamesPlayed: { $gt: 0 } })
      .sort({ bestScore: -1, lastPlayedAt: 1, createdAt: 1 })
      .limit(limit)
  }

  const { users } = getMemoryStore()

  return users
    .filter((user) => user.gamesPlayed > 0)
    .sort((leftUser, rightUser) => {
      if (rightUser.bestScore !== leftUser.bestScore) {
        return rightUser.bestScore - leftUser.bestScore
      }

      const leftLastPlayed = leftUser.lastPlayedAt
        ? new Date(leftUser.lastPlayedAt).getTime()
        : Number.MAX_SAFE_INTEGER
      const rightLastPlayed = rightUser.lastPlayedAt
        ? new Date(rightUser.lastPlayedAt).getTime()
        : Number.MAX_SAFE_INTEGER

      if (leftLastPlayed !== rightLastPlayed) {
        return leftLastPlayed - rightLastPlayed
      }

      return new Date(leftUser.createdAt).getTime() - new Date(rightUser.createdAt).getTime()
    })
    .slice(0, limit)
    .map(cloneMemoryUser)
}

module.exports = {
  createScore,
  createUser,
  findUserByEmail,
  findUserById,
  getUserId,
  listLeaderboardPlayers,
  saveUser,
}
