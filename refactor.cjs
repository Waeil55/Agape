const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        const dirPath = path.join(dir, f);
        const isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function refactorFile(filePath) {
    if (!filePath.endsWith('.jsx') && !filePath.endsWith('.js')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Refactor Cards
    content = content.replace(/\bbg-white\s+border\s+border-slate-200\s+rounded-(?:2xl|3xl|xl)\s*(?:overflow-hidden)?\s*shadow-sm\b/g, 'card-premium');
    content = content.replace(/\bbg-white\s+border\s+border-slate-200\s+rounded-(?:2xl|3xl|xl)\s*(?:overflow-hidden)?\b/g, 'card-premium');

    // Refactor Buttons to Premium Gradient
    content = content.replace(/\bbg-blue-600\s+hover:bg-blue-700\s+text-white\s+rounded-(?:xl|lg|md)\b/g, 'btn-gradient-primary');
    content = content.replace(/\bbg-blue-600\s+text-white\s+hover:bg-blue-700\s+rounded-(?:xl|lg|md)\b/g, 'btn-gradient-primary');
    content = content.replace(/\bbg-blue-600\s+text-white\s+rounded-(?:xl|lg|md)\b/g, 'btn-gradient-primary');

    // Secondary buttons (just make them a little nicer)
    // Actually let's just make the hover state nicer
    content = content.replace(/\bbg-white\s+border\s+border-slate-200\s+hover:bg-slate-50\b/g, 'bg-white border border-slate-200 hover:bg-slate-100 shadow-sm transition-all active:scale-95');

    // Modals
    content = content.replace(/\bbg-white\s+rounded-3xl\s+shadow-2xl\s+overflow-hidden\b/g, 'bg-white modal-premium');
    content = content.replace(/\bbg-white\s+rounded-2xl\s+shadow-xl\s+overflow-hidden\b/g, 'bg-white modal-premium');
    
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Refactored: ${filePath}`);
    }
}

walkDir(srcDir, refactorFile);
console.log('Refactoring complete.');
