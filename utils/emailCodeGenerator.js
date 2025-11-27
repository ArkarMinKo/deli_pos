// utils/emailCodeGenerator.js
function generateEmailCode() {
  // 6-digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getExpiryTime() {
  // 3 minutes from now
  return Date.now() + 3 * 60 * 1000;
}

module.exports = { generateEmailCode, getExpiryTime };
