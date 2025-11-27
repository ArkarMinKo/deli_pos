// utils/codeStore.js
const codes = {}; 

// Save a code for an email
function saveCode(email, code, expiresAt) {
  codes[email] = { code, expiresAt };
}

// Verify the code for an email
function verifyCode(email, inputCode) {
  const entry = codes[email];
  if (!entry) return { success: false, message: "Code not found" };
  if (Date.now() > entry.expiresAt) return { success: false, message: "သတ်မှတ်ထားသော အချိန်ထက် ကျော်လွန်သွားပါပီ" };
  if (entry.code !== inputCode) return { success: false, message: "ရိုက်ထည့်သော OTP Code မှားယွင်းနေပါသည်" };
  delete codes[email]; // remove after successful verification
  return { success: true, message: "မှန်ကန်ပါသည်" };
}

module.exports = { saveCode, verifyCode };
