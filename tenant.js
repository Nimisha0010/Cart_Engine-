const User = require('../models/User');

/**
 * Multi-tenant resolution middleware.
 *
 * Every request that touches a cart must be scoped to exactly one user.
 * This assignment does not require a full auth system, so we resolve
 * tenancy from a client-supplied `x-user-id` header — but we do NOT trust
 * that string as a database key directly. Instead we resolve/create an
 * internal User document keyed off it, and every downstream query uses
 * `req.userId` (a real ObjectId), never the raw header.
 *
 * This mirrors the shape of a real system (header/JWT -> verified
 * principal -> internal user id) while keeping the assignment's scope
 * focused on cart isolation rather than building an auth stack.
 *
 * Isolation guarantee: every Cart query in the controllers is filtered by
 * `user: req.userId`. A user can never read or mutate another user's cart
 * even if they guess a cart's ObjectId.
 */
async function resolveTenant(req, res, next) {
  try {
    const clientUserId = req.header('x-user-id');

    if (!clientUserId || typeof clientUserId !== 'string' || clientUserId.trim().length < 3) {
      return res.status(400).json({
        error: 'Bad Request',
        message:
          'Missing or invalid "x-user-id" header. Provide a stable client/user identifier (min 3 chars) to scope cart operations.',
      });
    }

    const normalizedId = clientUserId.trim();

    // findOneAndUpdate with upsert avoids a race between "find" and
    // "create" under concurrent first-time requests from the same user.
    const user = await User.findOneAndUpdate(
      { clientUserId: normalizedId },
      { $setOnInsert: { clientUserId: normalizedId } },
      { new: true, upsert: true }
    );

    req.userId = user._id;
    req.userDoc = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = resolveTenant;
