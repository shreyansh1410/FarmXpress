const mongoose = require("mongoose");
const validator = require("validator");
const { Schema } = mongoose;
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const URL_VALIDATION_OPTIONS = {
  require_protocol: true,
  require_tld: false,
};

const transportCompanySchema = new Schema({
  name: {
    type: String,
    required: true,
  },

  emailId: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
    trim: true,
    validate(value) {
      if (!validator.isEmail(value)) {
        throw new Error("Not a valid Email Id");
      }
    },
  },

  password: {
    required: false,
    type: String,
    minLength: 8,
    validate(value) {
      if (value && !validator.isStrongPassword(value)) {
        throw new Error("Enter a Strong Password");
      }
    },
  },

  googleId: {
    type: String,
    sparse: true,
    unique: true,
  },
  photoUrl: {
    type: String,
    default: "https://cdn-icons-png.flaticon.com/256/149/149071.png",
    validate(value) {
      if (!validator.isURL(value, URL_VALIDATION_OPTIONS)) {
        throw new Error("Enter a valid URL");
      }
    },
  },

  registrationNumber: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
  },

  address: {
    type: String,
  },
});

transportCompanySchema.methods.getJWT = async function () {
  const token = await jwt.sign({ _id: this._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  return token;
};

transportCompanySchema.methods.validatePassword = async function (
  passwordInputByCompany,
) {
  const isPasswordValid = await bcrypt.compare(
    passwordInputByCompany,
    this.password,
  );
  return isPasswordValid;
};

module.exports = mongoose.model("TransportCompany", transportCompanySchema);
