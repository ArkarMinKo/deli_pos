const formidable = require("formidable");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const db = require("../dbForPOS")

const { generateId } = require("../POS_utils/idAccountsGenerator");
const { generatePhotoName } = require("../POS_utils/photoNameGenerator");

function createAccounts(req, res) {
    const form = formidable({ multiples: false });
    form.uploadDir = path.join(__dirname, "../account_uploads");
    form.keepExtensions = true;

    if (!fs.existsSync(form.uploadDir)) {
      fs.mkdirSync(form.uploadDir, { recursive: true });
    }

    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Form parse error" }));
      }

      const username = fields.username;
      const email = fields.email;
      const password = fields.password;
      const phone = fields.phone;
      const role = fields.role;

      if (!username || !email || !password || !phone) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "လိုအပ်သော အချက်အလက်များ မပြည့်စုံပါ" }));
      }

      // 🔍 1️⃣ Check duplicate email
      const checkEmailSQL = "SELECT email FROM accounts WHERE email = ?";
      db.query(checkEmailSQL, [email], (err, results) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Database error", detail: err }));
        }

        if (results.length > 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်" }));
        }

        // 2️⃣ Generate new account ID
        generateId(db, async (err, newId) => {
          if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "ID generation failed" }));
          }

          try {
            // 3️⃣ Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // 4️⃣ Handle photo upload
            let photoName = null;

            if (files.photos && files.photos.originalFilename) {
              photoName = generatePhotoName(newId, files.photos.originalFilename);
              const newPath = path.join(form.uploadDir, photoName);

              fs.rename(files.photos.filepath, newPath, (err) => {
                if (err) console.log("Photo rename error:", err);
              });
            }

            // 5️⃣ Insert into DB
            const sql = `
              INSERT INTO accounts
              (id, username, email, password, photos, phone, role)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
              newId,
              username,
              email,
              hashedPassword,
              photoName,
              phone,
              role
            ];

            db.query(sql, values, (err, result) => {
              if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Database insert failed", detail: err }));
              }

              res.writeHead(201, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ message: "Account created successfully", id: newId }));
            });

          } catch (error) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error", detail: error.message }));
          }
        });
      });
    });
}

module.exports = { createAccounts };
