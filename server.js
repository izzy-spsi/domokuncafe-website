const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3700;
const root = __dirname;

app.use(express.static(root));

function sendHtml(name) {
  return (req, res) => res.sendFile(path.join(root, name));
}

app.get(['/community', '/community/'], sendHtml('community.html'));
app.get(['/community-bphs-tennis', '/community-bphs-tennis/'], sendHtml('community-bphs-tennis.html'));
app.get(['/dashboard', '/dashboard/'], sendHtml('dashboard.html'));
app.get(['/staff', '/staff/'], sendHtml('staff.html'));

app.get('*', (req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

app.listen(PORT, () => {
  console.log('Domo Cafe landing running on port ' + PORT);
});
