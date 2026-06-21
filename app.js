const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const cartRoutes = require('./routes/cartRoutes');
const productRoutes = require('./routes/productRoutes');
const apiLimiter = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(apiLimiter);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/products', productRoutes);
  app.use('/api/cart', cartRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
