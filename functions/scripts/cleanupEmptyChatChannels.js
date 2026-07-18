const admin = require('firebase-admin');

admin.initializeApp();
const apply = process.argv.includes('--apply');

async function main() {
  const snapshot = await admin.firestore().collection('chat_channels').get();
  const empty = snapshot.docs.filter((doc) => {
    const message = doc.data().lastMessage;
    return !message || message.senderId === 'system' || message.text === 'Started a new chat';
  });
  console.log(`${apply ? 'Deleting' : 'Dry run:'} ${empty.length} empty chat channel(s).`);
  for (const channel of empty) {
    console.log(channel.id);
    if (apply) await channel.ref.delete();
  }
  if (!apply) console.log('Run with --apply to delete the listed placeholder channels.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
