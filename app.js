require("dotenv").config();

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const Booking = require("./models/booking.js");
const path = require("path");
const methodOverride = require("method-override");
const session = require("express-session");

// PDF receipt
const PDFDocument = require("pdfkit");
const fs = require("fs");

// Twilio
const twilio = require("twilio");
const client = new twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// --------------------------------------------------
// SESSION SETUP
// --------------------------------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  })
);

// Make session available in all EJS
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// --------------------------------------------------
// DATABASE CONNECTION
// --------------------------------------------------
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderlust";

async function main() {
  await mongoose.connect(MONGO_URL);
}

main()
  .then(() => console.log("connected to DB"))
  .catch((err) => console.log(err));

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static("public"));

// TEMP folder for receipts
if (!fs.existsSync("./temp")) fs.mkdirSync("./temp");

// --------------------------------------------------
// PROTECTION MIDDLEWARE
// --------------------------------------------------
function requireUserLogin(req, res, next) {
  if (req.session.isLoggedIn) return next();
  return res.redirect("/login");
}

function requireAdminLogin(req, res, next) {
  if (req.session.isAdmin) return next();
  return res.redirect("/admin/login");
}

// --------------------------------------------------
// ROUTES START
// --------------------------------------------------

// HOME
app.get("/", (req, res) => {
  res.render("home");
});

// LOGIN PAGE
app.get("/login", (req, res) => {
  res.render("auth/login");
});

// SEARCH LISTINGS
app.get("/search", async (req, res) => {
  const q = req.query.q;

  const results = await Listing.find({
    title: { $regex: q, $options: "i" },
  });

  res.render("listings/search", { results, query: q });
});

// LISTINGS INDEX
app.get("/listings", async (req, res) => {
  const allListings = await Listing.find({});
  res.render("listings/index", { allListings });
});

// CREATE NEW LISTING (ADMIN)
app.get("/listings/new", requireAdminLogin, (req, res) => {
  res.render("listings/new");
});

app.post("/listings", requireAdminLogin, async (req, res) => {
  const newListing = new Listing(req.body.listing);
  await newListing.save();
  res.redirect("/listings");
});

// SHOW LISTING
app.get("/listings/:id", async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  res.render("listings/show", { listing });
});

// EDIT LISTING
app.get("/listings/:id/edit", requireAdminLogin, async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  res.render("listings/edit", { listing });
});

// UPDATE LISTING
app.put("/listings/:id", requireAdminLogin, async (req, res) => {
  await Listing.findByIdAndUpdate(req.params.id, req.body.listing);
  res.redirect(`/listings/${req.params.id}`);
});

// DELETE LISTING
app.delete("/listings/:id", requireAdminLogin, async (req, res) => {
  await Listing.findByIdAndDelete(req.params.id);
  res.redirect("/listings");
});

// --------------------------------------------------
// BOOKING + PDF RECEIPT
// --------------------------------------------------
app.post("/book/:id", requireUserLogin, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    const { checkIn, checkOut } = req.body;

    const days =
      (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24);

    if (days <= 0) {
      return res.send(`<h2>Invalid dates selected</h2>
      <a href="/listings/${req.params.id}">Go back</a>`);
    }

    const totalPrice = days * listing.price;

    const booking = await Booking.create({
      listing: listing._id,
      userPhone: req.session.phone,
      checkIn,
      checkOut,
      totalPrice,
    });

    // -------------------------
    // CREATE PDF RECEIPT
    // -------------------------
    const filePath = path.join(__dirname, "temp", `receipt_${booking._id}.pdf`);
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(22).text("WanderLust Booking Receipt", { underline: true });
    doc.moveDown();

    doc.fontSize(14).text(`Booking ID: ${booking._id}`);
    doc.text(`Listing: ${listing.title}`);
    doc.text(`User Phone: ${req.session.phone}`);
    doc.text(`Check-in: ${checkIn}`);
    doc.text(`Check-out: ${checkOut}`);
    doc.text(`Nights: ${days}`);
    doc.text(`Price Per Night: $${listing.price}`);
    doc.text(`Total Amount: $${totalPrice}`);
    doc.moveDown();
    doc.text(`Generated On: ${new Date().toLocaleString()}`);

    doc.end();

    stream.on("finish", () => {
      res.download(filePath, () => fs.unlinkSync(filePath));
    });
  } catch (err) {
    console.log(err);
    res.send("Error processing booking.");
  }
});

// --------------------------------------------------
// USER BOOKING HISTORY
// --------------------------------------------------
app.get("/user/history", requireUserLogin, async (req, res) => {
  const bookings = await Booking.find({
    userPhone: req.session.phone,
  })
    .populate("listing")
    .sort({ createdAt: -1 });

  res.render("auth/history", { bookings });
});

// --------------------------------------------------
// USER PROFILE
// --------------------------------------------------
app.get("/user/profile", requireUserLogin, (req, res) => {
  res.render("auth/profile", { phone: req.session.phone });
});

// --------------------------------------------------
// OTP LOGIN SYSTEM
// --------------------------------------------------
app.post("/send-otp", async (req, res) => {
  const phone = req.body.phone;
  const otp = Math.floor(100000 + Math.random() * 900000);

  req.session.phone = phone;
  req.session.otp = otp;

  try {
    await client.messages.create({
      body: `Your WanderLust OTP is ${otp}`,
      to: phone,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    console.log("OTP sent:", otp);
    res.redirect("/verify-otp");
  } catch (err) {
    console.error(err);
    res.send("Error sending OTP.");
  }
});

// OTP VERIFY PAGE
app.get("/verify-otp", (req, res) => {
  res.render("auth/verify");
});

// VERIFY OTP
app.post("/verify-otp", (req, res) => {
  const userOtp = req.body.otp;

  if (userOtp == req.session.otp) {
    req.session.isLoggedIn = true;
    res.redirect("/user/dashboard");
  } else {
    res.send("Invalid OTP. Please try again.");
  }
});

// USER DASHBOARD
app.get("/user/dashboard", requireUserLogin, (req, res) => {
  res.render("auth/userDashboard");
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// --------------------------------------------------
// ADMIN LOGIN SYSTEM
// --------------------------------------------------
const ADMIN_EMAIL = "admin@wanderlust.com";
const ADMIN_PASSWORD = "admin123";

app.get("/admin/login", (req, res) => {
  res.render("auth/adminLogin");
});

app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.redirect("/admin/dashboard");
  } else {
    res.send("Invalid admin credentials");
  }
});

// ADMIN DASHBOARD
app.get("/admin/dashboard", requireAdminLogin, (req, res) => {
  res.render("auth/adminDashboard");
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
app.listen(8080, () => {
  console.log("server is listening to port 8080");
});
