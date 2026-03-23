require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const { seedEthiopiaLocationDirectory } = require("../src/utils/locationDirectory");

function readFlag(name) {
  const argv = process.argv.slice(2);
  return argv.includes(`--${name}`) || argv.includes(`--${name}=true`);
}

async function main() {
  await connectDB();
  const overwrite = readFlag("overwrite");
  const summary = await seedEthiopiaLocationDirectory({ overwrite });
  console.log("Ethiopia locations seeded.");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("Location seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });
