const admin = require("firebase-admin");
const path = require("path");

function loadServiceAccount() {
  const json = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (json) {
    return JSON.parse(json);
  }

  const filePath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim();
  if (filePath) {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(resolved);
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  let privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").trim();
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  throw new Error(
    "Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY."
  );
}

function initFirebaseAdmin() {
  if (admin.apps.length) return admin.app();
  const serviceAccount = loadServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return admin.app();
}

function getFirebaseAuth() {
  initFirebaseAdmin();
  return admin.auth();
}

module.exports = { getFirebaseAuth };
