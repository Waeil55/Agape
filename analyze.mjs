import fs from 'fs';

const code = fs.readFileSync('dist/assets/index-DtFaQOc_.js', 'utf8');

// Check total length and line count
const lines = code.split('\n');
console.log('Total lines:', lines.length);

// The main code is all JS concatenated. Let me find the entry module (App.jsx) position
// by looking for the Bf (App) function definition
const bfIdx = code.indexOf(',Bf=');
console.log('Bf (App) at byte position:', bfIdx !== -1 ? bfIdx : 'not found');

// Find all occurrences of 'Ya' as a variable name (with word boundaries)
const yaPositions = [];
let pos = -1;
while ((pos = code.indexOf('Ya', pos + 1)) !== -1) {
  // Check it's a variable reference, not part of a longer name or string
  const before = pos > 0 ? code[pos - 1] : '';
  const after = pos + 2 < code.length ? code[pos + 2] : '';
  if (/[^a-zA-Z0-9_$]/.test(before) && /[^a-zA-Z0-9_$]/.test(after)) {
    yaPositions.push(pos);
  }
}
console.log('Total Ya references:', yaPositions.length);

// Find out which line:col each Ya is at
yaPositions.forEach((p, i) => {
  let charCount = 0;
  for (let j = 0; j < lines.length; j++) {
    if (charCount + lines[j].length >= p) {
      const col = p - charCount;
      const ctx = lines[j].substring(Math.max(0, col - 15), Math.min(lines[j].length, col + 20));
      console.log(`${i}: Ya at line ${j + 1}:${col} context: ${ctx}`);
      break;
    }
    charCount += lines[j].length + 1;
  }
});

// Now check: is 'Ya' declared with const/let/var at module level?
// Module-level code is everything before the first component function
// The main component functions start with <function> = (<params>) => {
// Let's find the first arrow function that defines a component

// Look for the pattern before Bf - check what scope Ya is in
// Check if there's a const Ya = ... at module level
const constYaMatch = code.match(/[;{]const\s+Ya\s*=/);
console.log('\nconst Ya at module level:', constYaMatch ? constYaMatch[0].substring(0, 50) : 'not found');

// Check if there's let Ya = ... at module level
const letYaMatch = code.match(/[;{]let\s+Ya\s*=/);
console.log('let Ya at module level:', letYaMatch ? letYaMatch[0] : 'not found');

// Check if there's var Ya = ... at module level  
const varYaMatch = code.match(/[;{]var\s+Ya\s*=/);
console.log('var Ya at module level:', varYaMatch ? varYaMatch[0] : 'not found');

// The issue might be that Ya is referenced inside the App function
// but Ya is actually a different variable from another module
// Let me check what module the first Ya belongs to by using sourcemap

import('source-map').then(async (sm) => {
  const raw = fs.readFileSync('dist/assets/index-DtFaQOc_.js.map', 'utf8');
  const consumer = await new sm.SourceMapConsumer(raw);

  // For the first Ya at position yaPositions[0]
  if (yaPositions.length > 0) {
    let charCount = 0;
    for (let j = 0; j < lines.length; j++) {
      if (charCount + lines[j].length >= yaPositions[0]) {
        const col = yaPositions[0] - charCount;
        const p = consumer.originalPositionFor({ line: j + 1, column: col });
        console.log('\nFirst Ya source:', JSON.stringify(p));
        break;
      }
      charCount += lines[j].length + 1;
    }
  }
  consumer.destroy();
});
