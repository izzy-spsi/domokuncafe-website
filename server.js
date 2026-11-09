const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3700;
const root = __dirname;

function sendHtml(name) {
  return (req, res) => res.sendFile(path.join(root, name));
}

// Before static so /reservations is the page, not a folder redirect.
app.get(['/reservations', '/reservations/'], sendHtml('reservations/index.html'));

app.use(express.static(root));

app.get(['/community', '/community/'], sendHtml('community.html'));
app.get(['/dashboard', '/dashboard/'], sendHtml('dashboard.html'));
app.get(['/staff', '/staff/'], sendHtml('staff.html'));

app.get('*', (req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

app.listen(PORT, () => {
  console.log('Domo Cafe landing running on port ' + PORT);
});
