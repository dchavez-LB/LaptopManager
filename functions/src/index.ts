import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

const SUPPORT_TEAM_EMAILS: string[] = [
  'dchavez@byron.edu.pe',
  'lricra@byron.edu.pe',
  'phuamani@byron.edu.pe'
];

function determineRole(email: string): 'support' | 'teacher' {
  const lower = email.toLowerCase();
  if (SUPPORT_TEAM_EMAILS.includes(lower)) return 'support';
  // Por dominio institucional, profesor
  if (lower.endsWith('@byron.edu.pe')) return 'teacher';
  // Por defecto, profesor
  return 'teacher';
}

// Crea/actualiza documento en Firestore cuando se crea un usuario en Auth
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  const email = (user.email || '').toLowerCase();
  if (!email) return;

  const role = determineRole(email);
  const ref = db.collection('users').doc(user.uid);
  await ref.set({
    id: user.uid,
    email,
    name: user.displayName || email.split('@')[0],
    role,
    photoURL: user.photoURL ?? null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLogin: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
});

// Sincronización manual de todos los usuarios de Auth hacia Firestore (llamable)
export const syncAuthUsers = functions.https.onCall(async (data, context) => {
  const callerEmail = context.auth?.token?.email?.toLowerCase() || '';
  if (!callerEmail || !SUPPORT_TEAM_EMAILS.includes(callerEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'Solo soporte puede ejecutar sincronización.');
  }

  let nextPageToken: string | undefined;
  let count = 0;
  do {
    const list = await admin.auth().listUsers(1000, nextPageToken);
    for (const u of list.users) {
      const email = (u.email || '').toLowerCase();
      if (!email) continue;
      const role = determineRole(email);
      const ref = db.collection('users').doc(u.uid);
      await ref.set({
        id: u.uid,
        email,
        name: u.displayName || email.split('@')[0],
        role,
        photoURL: u.photoURL ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      count++;
    }
    nextPageToken = list.pageToken;
  } while (nextPageToken);

  return { synced: count };
});

// Actualiza Firestore cuando se borra un usuario en Auth
export const onUserDelete = functions.auth.user().onDelete(async (user) => {
  const ref = db.collection('users').doc(user.uid);
  await ref.delete().catch(() => {});
});