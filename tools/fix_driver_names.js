/**
 * Migration script: fixes trip.driverName where it doesn't match the
 * driver's actual name in the drivers collection.
 *
 * Usage:
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS to your service account key path
 *      OR run from a Firebase Cloud Function environment.
 *   2. node tools/fix_driver_names.js [--dry-run]
 *
 * With --dry-run, only logs what would change without writing.
 */
const admin = require('firebase-admin');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // Try loading service account from env or well-known path
  let app;
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(__dirname, '..', 'service-account.json');
  try {
    app = admin.initializeApp({
      projectId: 'agape-95c9f',
      credential: admin.credential.applicationDefault(),
    });
    await app.firestore().listCollections();
  } catch {
    try {
      app = admin.initializeApp({
        projectId: 'agape-95c9f',
        credential: admin.credential.cert(saPath),
      });
    } catch {
      console.error('Could not initialize Firebase Admin. Set GOOGLE_APPLICATION_CREDENTIALS or place service-account.json in project root.');
      process.exit(1);
    }
  }

  const db = app.firestore();
  const settings = { timestampsInSnapshots: true };
  db.settings(settings);

  // 1. Load all driver profiles
  console.log('Loading driver profiles...');
  const driversSnap = await db.collection('drivers').get();
  const drivers = {};
  driversSnap.forEach(doc => {
    const data = doc.data();
    drivers[doc.id] = data;
    if (data.email) drivers[data.email.toLowerCase()] = data;
  });
  console.log(`  Found ${driversSnap.size} driver profiles`);

  // 2. Load all trip documents
  console.log('Loading trips...');
  const tripsSnap = await db.collection('trips').get();
  console.log(`  Found ${tripsSnap.size} trip documents`);

  let changed = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of tripsSnap.docs) {
    try {
      const trip = doc.data();
      const driverId = trip.driverId;
      const driverEmail = trip.driverEmail ? String(trip.driverEmail).trim().toLowerCase() : null;
      const currentName = trip.driverName;

      // Find the driver profile
      let driverProfile = null;
      if (driverId && drivers[driverId]) {
        driverProfile = drivers[driverId];
      } else if (driverEmail && drivers[driverEmail]) {
        driverProfile = drivers[driverEmail];
      }

      if (!driverProfile || !driverProfile.name) {
        skipped++;
        continue;
      }

      const correctName = String(driverProfile.name).trim();
      const storedName = String(currentName || '').trim();

      if (storedName === correctName) {
        skipped++;
        continue;
      }

      console.log(`\n  Trip ${doc.id}:`);
      console.log(`    driverId: ${driverId}`);
      console.log(`    stored driverName: "${storedName || '(empty)'}"`);
      console.log(`    correct driverName: "${correctName}"`);

      if (!DRY_RUN) {
        await doc.ref.update({ driverName: correctName });
        console.log('    ✅ Updated');
      } else {
        console.log('    ⏺ Would update (dry-run)');
      }
      changed++;
    } catch (err) {
      console.error(`  ❌ Error processing trip ${doc.id}:`, err.message);
      errors++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Total trips: ${tripsSnap.size}`);
  console.log(`  Updated: ${changed}`);
  console.log(`  Skipped (matched or no driver): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  if (DRY_RUN) console.log('  (dry-run mode — no data was written)');

  await app.delete();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
