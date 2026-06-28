const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8').split('\n');
c.forEach((l, i) => {
  if (l.includes('useState(') && (l.includes("'") || l.includes('"'))) {
    console.log(i + 1, ':', l.trim());
  }
});
