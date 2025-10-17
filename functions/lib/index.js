"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserDelete = exports.adminUpdateUser = exports.syncAuthUsers = exports.onUserCreate = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
const SUPPORT_TEAM_EMAILS = [
    'dchavez@byron.edu.pe',
    'lricra@byron.edu.pe',
    'phuamani@byron.edu.pe'
];
const ADMIN_EMAILS = [
    'lmadmin@byron.edu.pe'
];
function determineRole(email) {
    const lower = email.toLowerCase();
    if (SUPPORT_TEAM_EMAILS.includes(lower))
        return 'support';
    if (ADMIN_EMAILS.includes(lower))
        return 'admin';
    // Por dominio institucional, profesor
    if (lower.endsWith('@byron.edu.pe'))
        return 'teacher';
    // Por defecto, profesor
    return 'teacher';
}
// Crea/actualiza documento en Firestore cuando se crea un usuario en Auth
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
    const email = (user.email || '').toLowerCase();
    if (!email)
        return;
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
exports.syncAuthUsers = functions.https.onCall(async (data, context) => {
    const callerEmail = context.auth?.token?.email?.toLowerCase() || '';
    if (!callerEmail || (!SUPPORT_TEAM_EMAILS.includes(callerEmail) && !ADMIN_EMAILS.includes(callerEmail))) {
        throw new functions.https.HttpsError('permission-denied', 'Solo soporte o administrador puede ejecutar sincronización.');
    }
    let nextPageToken;
    let count = 0;
    do {
        const list = await admin.auth().listUsers(1000, nextPageToken);
        for (const u of list.users) {
            const email = (u.email || '').toLowerCase();
            if (!email)
                continue;
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
// Actualización por administrador: nombre y/o contraseña
exports.adminUpdateUser = functions.https.onCall(async (data, context) => {
    const callerEmail = context.auth?.token?.email?.toLowerCase() || '';
    if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
        throw new functions.https.HttpsError('permission-denied', 'Solo el administrador puede modificar usuarios.');
    }
    const { uid, name, password } = (data || {});
    if (!uid || typeof uid !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Se requiere el UID del usuario.');
    }
    try {
        if (name && typeof name === 'string') {
            await admin.auth().updateUser(uid, { displayName: name });
            await db.collection('users').doc(uid).set({ name }, { merge: true });
        }
        if (password && typeof password === 'string') {
            if (password.length < 6) {
                throw new functions.https.HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
            }
            await admin.auth().updateUser(uid, { password });
        }
        return { ok: true };
    }
    catch (err) {
        const code = (err?.code || 'unknown');
        throw new functions.https.HttpsError('internal', `No se pudo actualizar el usuario: ${String(code)}`);
    }
});
// Actualiza Firestore cuando se borra un usuario en Auth
exports.onUserDelete = functions.auth.user().onDelete(async (user) => {
    const ref = db.collection('users').doc(user.uid);
    await ref.delete().catch(() => { });
});
