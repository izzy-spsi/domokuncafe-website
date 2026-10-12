const express = require('express');
const path = require('path');
const { mountSurvey, startSurvey } = require('./survey/mount');

function createApp() {
  const app = express();
  const root = __dirname;
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1' || process.env.RAILWAY_ENVIRONMENT) {
    app.set('trust proxy', 1);
  }
  mountSurvey(app, { root });

  app.use(express.static(root));

  function sendHtml(name) {
    return (req, res) => res.sendFile(path.join(root, name));
  }

  app.get(['/community', '/community/'], sendHtml('community.html'));
  app.get(['/community-example-tennis', '/community-example-tennis/'], sendHtml('community-example-tennis.html'));
  app.get(['/dashboard', '/dashboard/'], sendHtml('dashboard.html'));
  app.get(['/staff', '/staff/'], sendHtml('staff.html'));

  app.get('*', (req, res) => {
    res.sendFile(path.join(root, 'index.html'));
  });

  return app;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3700;
  const app = createApp();
  startSurvey().finally(() => {
    app.listen(PORT, () => {
      console.log('Domo Cafe landing running on port ' + PORT);
    });
  });
}

module.exports = { createApp };
