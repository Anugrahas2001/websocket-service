// const admin = require("firebase-admin");
// require("dotenv").config();

// const data = process.env.FIREBASE_SERVICE_ACCOUNT;
// console.log(data, "SERVICE DATAA");

// const serviceAccount = JSON.parse(data);

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// module.exports = admin;

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;

const serviceAccount = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, serviceAccountPath), "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
