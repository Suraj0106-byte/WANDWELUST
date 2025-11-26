const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
  user: { type: String, default: "guest" }, // later we will add user model
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  totalPrice: Number
});

module.exports = mongoose.model("Booking", bookingSchema);
