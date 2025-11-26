const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,

  // Fix: The image is an OBJECT (filename + url)
  image: {
    type: {
      filename: String,
      url: String,
    },
    default: {
      filename: "defaultimage",
      url: "https://images.unsplash.com/photo-1625505826533-5c80aca7d157?auto=format&fit=crop&w=800&q=60"
    }
  },

  price: Number,
  location: String,
  country: String
});

module.exports = mongoose.model("Listing", listingSchema);
