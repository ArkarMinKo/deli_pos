const formidable = require("formidable");
const sendMail = require("../utils/mailer");
const { generateEmailCode, getExpiryTime } = require("../utils/emailCodeGenerator");
const { saveCode, verifyCode } = require("../utils/codeStore");

function requestEmailConfirmation(req, res) {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields) => {
    console.log("fields:", fields); // ဒီနေရာ
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { email } = fields;
    if (!email) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ message: "Email is required" }));
    }

    const code = generateEmailCode();
    const expiresAt = getExpiryTime();
    saveCode(email, code, expiresAt);

    sendMail(
      email,
      "Customer",
      "confirmation",
      { code: `${code}`}
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "email အတည်ပြုကုဒ် ပို့ပေးလိုက်ပါပြီ ၃ မိနစ်အတွင်း ရိုက်ထည့်ပေးပါ", email }));
  });
}

function verifyEmailCodeBeforeCreate(req, res) {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { email, code } = fields;
    if (!email || !code) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ message: "Email and code are required" }));
    }

    const result = verifyCode(email, code);
    if (!result.success) {
      res.statusCode = 400;
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: result.message }));
    }

    res.end(JSON.stringify({ message: "email " }));
  });
}

module.exports = {
    requestEmailConfirmation,
    verifyEmailCodeBeforeCreate
};