const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

function verifyJWT(req) {
  return new Promise((resolve, reject) => {
    const authHeader = req.headers["authorization"];

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }

    if (!authHeader) {
      return reject({ status: 401, message: "No token provided" });
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "MSHteam") {
      return reject({ status: 401, message: "Invalid token format" });
    }

    const token = parts[1];

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return reject({ status: 403, message: "Invalid or expired token" });
      }

      // decoded = { userId, role, ... }
      req.user = decoded;
      resolve(decoded);
    });
  });
}

function generateToken(user) {
  const payload = {
    userId: user.id,
    type: user.type
  };

  if (user.role) {
    payload.role = user.role;
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d"
  });
}


module.exports = {verifyJWT, generateToken}