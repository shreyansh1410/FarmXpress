const mongoose = require("mongoose");

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    console.log("Already connected to MongoDB");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_STRING, {
      serverSelectionTimeoutMS: 5000, // Prevents long waits
      connectTimeoutMS: 10000, // Max time to connect
    });
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error.message);
    throw new Error("Database Connection Failed");
  }
};

module.exports = connectDB;
