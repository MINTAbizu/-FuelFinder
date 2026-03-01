const mongoose = require("mongoose");
const MONGODB_URI = process.env.MONGO_URI || "mongodb://localhost:27017/fuelfinder";
async function connectDB() {
  const uri = MONGODB_URI ;
  if (!uri) {
    throw new Error("MONGODB_URI is missing in environment variables.");
  }

  await mongoose.connect(uri);
  console.log("MongoDB connected");
}

module.exports = connectDB;
