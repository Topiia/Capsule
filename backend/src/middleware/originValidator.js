const isAllowedOrigin = (origin) => {
  if (!origin) return false;

  const allowedExacts = [
    'http://localhost:3000',
    'https://capsule.topiiaa.site',
  ];

  if (allowedExacts.includes(origin)) {
    return true;
  }

  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) {
    return true;
  }

  const corsOriginsEnv = process.env.CORS_ORIGINS;
  if (corsOriginsEnv) {
    const configuredOrigins = corsOriginsEnv.split(',').map((o) => o.trim());
    if (configuredOrigins.includes(origin)) {
      return true;
    }
  }

  return false;
};

module.exports = isAllowedOrigin;
