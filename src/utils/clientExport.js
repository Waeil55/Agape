// Client-side Firestore exporter (uses existing initialized firebase client)
// Open your app in the browser and run `window.exportAppData()` in the console.

import { collection, getDocs } from '../config/firebase';
import { db } from '../config/firebase';

async function readCollection(name) {
  try {
    const col = collection(db, name);
    const snap = await getDocs(col);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Failed to read collection', name, err);
    return null;
  }
}

export async function exportAppData() {
  const collections = ['trips','drivers','vehicles','dispatchers','users','reports','logs','trashedTrips','phoneNumbers'];
  const out = {};
  for (const c of collections) {
    out[c] = await readCollection(c);
  }

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agape-client-export-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return out;
}

// Expose to window for quick use
if (typeof window !== 'undefined') {
  window.exportAppData = exportAppData;
}

export default exportAppData;
