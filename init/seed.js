const mongoose = require("mongoose");
const Listing = require("../models/listing.js");
const { data: sampleListings } = require("./data.js");

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";

async function main() {
  await mongoose.connect(MONGO_URL);
  console.log("🌿 Connected to MongoDB");
}

async function seedDB() {
  await Listing.deleteMany({});
  console.log("🗑️ Old listings deleted");

  await Listing.insertMany(sampleListings);
  console.log("🌟 Sample listings inserted!");

  mongoose.connection.close();
  console.log("🔌 Connection closed");
}

main().then(() => seedDB());
