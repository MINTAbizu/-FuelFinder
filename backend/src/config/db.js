const mongoose = require("mongoose");

async function connectDB() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    (process.env.NODE_ENV === "production" ? "" : "mongodb://localhost:27017/fuelfinder");

  if (!uri) {
    throw new Error("MongoDB URI is missing. Set MONGODB_URI (or MONGO_URI).");
  }

  await mongoose.connect(uri);
  console.log("MongoDB connected");
}

module.exports = connectDB;
