const path = require('path');
const express = require('express');
const { router } = require('./routes');
const { migrate } = require('./migrate');

function mountSurvey(app, options = {}) {
  const root = options.root || path.join(__dirname, '..');
  app.use('/survey-assets', express.static(path.join(root, 'survey', 'public'), {
    index: false,
    maxAge: '1h'
  }));
  app.use(router);
  app.use((req, res, next) => {
    if (req.path === '/survey' || req.path.startsWith('/survey/')) {
      return res.status(404).type('text/plain').send('Not found');
    }
    return next();
  });
}

async function startSurvey() {
  try {
    await migrate();
    if (process.env.SURVEY_SEED === '1') {
      const { seed } = require('./seed');
      await seed();
    }
  } catch (error) {
    console.error('Survey startup did not finish:', error.message);
  }
}

module.exports = { mountSurvey, startSurvey };
