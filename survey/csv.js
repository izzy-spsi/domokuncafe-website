function csvCell(value) {
  if (value == null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => csvCell(row[header])).join(','));
  });
  return `${lines.join('\r\n')}\r\n`;
}

module.exports = { csvCell, toCsv };
