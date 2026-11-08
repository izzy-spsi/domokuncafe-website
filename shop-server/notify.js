const fs = require('fs');
const path = require('path');

class NotifyList {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  lock(fn) {
    const run = this.queue.then(() => fn());
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  write(list) {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  add(email, variantId) {
    return this.lock(() => {
      const list = this.read();
      const key = email.toLowerCase() + '|' + variantId;
      const exists = list.some((entry) => (entry.email || '').toLowerCase() + '|' + entry.variantId === key);
      if (!exists) {
        list.push({ email, variantId, createdAt: new Date().toISOString() });
        this.write(list);
      }
      return { ok: true, created: !exists };
    });
  }
}

module.exports = { NotifyList };
