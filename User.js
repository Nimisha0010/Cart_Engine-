const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Minimal tenant/user identity model.
 *
 * Full authentication (passwords, OAuth, JWT issuance) is explicitly out of
 * scope for this assignment. What IS in scope is multi-tenant isolation, so
 * this model exists to give every cart a durable, indexed owner reference
 * rather than trusting a raw client-supplied string at every layer.
 *
 * Users are "upserted" the first time a clientUserId is seen (see
 * middleware/tenant.js). This mirrors how a real system would resolve an
 * authenticated principal from a verified token into an internal user
 * document, without requiring us to build a full auth stack here.
 */
const userSchema = new Schema(
  {
    clientUserId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
      minlength: 3,
      maxlength: 120,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    tier: {
      type: String,
      enum: ['standard', 'silver', 'gold', 'platinum'],
      default: 'standard',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
