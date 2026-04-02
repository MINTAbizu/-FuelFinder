const mongoose = require("mongoose");

function maskMongoUri(uri) {
  const text = String(uri || "").trim();
  if (!text) return "";

  return text.replace(
    /(mongodb(?:\+srv)?:\/\/)([^:@/]+)(?::([^@/]*))?@/i,
    (_match, prefix, username) => `${prefix}${username}:***@`
  );
}

function summarizePlainError(error) {
  if (!error) return undefined;

  return {
    name: error.name || "",
    message: error.message || String(error),
    code: error.code,
    codeName: error.codeName,
    stack: typeof error.stack === "string" ? error.stack : undefined,
  };
}

function summarizeTopologyReason(reason) {
  if (!reason || typeof reason !== "object") return undefined;

  const summary = {
    type: reason.constructor?.name || typeof reason,
    message: typeof reason.message === "string" ? reason.message : undefined,
    code: reason.code,
    codeName: reason.codeName,
    setName: typeof reason.setName === "string" ? reason.setName : undefined,
    compatibilityError:
      typeof reason.compatibilityError === "string" ? reason.compatibilityError : undefined,
    logicalSessionTimeoutMinutes:
      typeof reason.logicalSessionTimeoutMinutes === "number"
        ? reason.logicalSessionTimeoutMinutes
        : undefined,
  };

  if (reason.servers instanceof Map) {
    summary.servers = Array.from(reason.servers.entries()).map(([address, server]) => ({
      address,
      type: server?.type,
      hosts: Array.isArray(server?.hosts) ? server.hosts : undefined,
      passives: Array.isArray(server?.passives) ? server.passives : undefined,
      arbiters: Array.isArray(server?.arbiters) ? server.arbiters : undefined,
      tags: server?.tags || undefined,
      minWireVersion: server?.minWireVersion,
      maxWireVersion: server?.maxWireVersion,
      roundTripTime: server?.roundTripTime,
      lastUpdateTime: server?.lastUpdateTime,
      error: summarizePlainError(server?.error),
    }));
  }

  return summary;
}

async function connectDB() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    (process.env.NODE_ENV === "production" ? "" : "mongodb://localhost:27017/fuelfinder");

  if (!uri) {
    throw new Error("MongoDB URI is missing. Set MONGODB_URI (or MONGO_URI).");
  }

  try {
    await mongoose.connect(uri);
  } catch (error) {
    const details = {
      target: maskMongoUri(uri),
      name: error?.name || "",
      message: error?.message || String(error),
      code: error?.code,
      codeName: error?.codeName,
      cause: summarizePlainError(error?.cause),
      reason: summarizeTopologyReason(error?.reason),
      stack: typeof error?.stack === "string" ? error.stack : undefined,
    };

    console.error("[db] MongoDB connection failed:");
    console.error(JSON.stringify(details, null, 2));
    throw error;
  }

  console.log("MongoDB connected");
}

module.exports = connectDB;
