const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('survey pages do not use the site theme or seasonal assets', () => {
  const dir = path.join(__dirname, '..', 'public');
  const files = fs.readdirSync(dir).filter((file) => /\.(html|js|css)$/.test(file));
  assert.ok(files.includes('guest.html'));
  files.forEach((file) => {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(text, /domoween|site-shell|seasons\/|assets\/sydney/i, file);
  });
  const guest = fs.readFileSync(path.join(dir, 'guest.html'), 'utf8');
  assert.match(guest, /survey\.css/);
  assert.match(guest, /Step|survey-main/);
  const css = fs.readFileSync(path.join(dir, 'survey.css'), 'utf8');
  assert.match(css, /min-height:\s*48px/);
});
