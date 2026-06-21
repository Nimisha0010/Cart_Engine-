require('dotenv').config();

const createApp = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 4000;

async function start() {
  await connectDB();

  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(`[server] Adaptive Cart Engine listening on port ${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`[server] received ${signal}, shutting down gracefully...`);
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
