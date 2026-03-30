const jwt = require('jsonwebtoken')
const User = require('../models/User')

function getJwtSecret() {
  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not set. Add it to backend/.env before starting the server.')
  }

  return jwtSecret
}

function createToken(userId) {
  return jwt.sign({ sub: userId }, getJwtSecret(), {
    expiresIn: '7d',
  })
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  try {
    const payload = jwt.verify(token, getJwtSecret())
    const user = await User.findById(payload.sub)

    if (!user) {
      res.status(401).json({ message: 'User session is no longer valid.' })
      return
    }

    req.user = user
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' })
  }
}

module.exports = {
  createToken,
  requireAuth,
}
