const formidable = require("formidable");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { generateOrderId } = require("../utils/idOrderGenerator");

const UPLOAD_DIR = path.join(__dirname, "../orders_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function postOrder(req, res) {
  const form = new formidable.IncomingForm({ multiples: false });

  form.parse(req, (err, fields) => {
    if (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: false, message: "Form parse error" }));
    }

    try {
      const {
        userId,
        name,
        address,
        location,
        phone,
        type,
        remark,
        orders,
        total_order,
        discount,
        tax,
        extra,
        grand_total,
        payment_method,
        payment_phone,
        payment_name,
        payment_photo // base64 string
      } = fields;

      if (!userId || !orders || !grand_total || !payment_photo) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: false, message: "Missing required fields" }));
      }

      const ordersArray = JSON.parse(orders);

      // Generate Order ID first
      generateOrderId(db, (err, newOrderId) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: false, message: "ID generation error" }));
        }

        // ==========================
        // Base64 → Image Save
        // ==========================

        let base64Data = payment_photo;
        let extension = "png";

        // detect image type
        const matches = base64Data.match(/^data:image\/(\w+);base64,/);
        if (matches) {
          extension = matches[1];
          base64Data = base64Data.replace(/^data:image\/\w+;base64,/, "");
        }

        const fileName = `${newOrderId}_${Date.now()}.${extension}`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        const buffer = Buffer.from(base64Data, "base64");

        fs.writeFileSync(filePath, buffer);

        const relativePath = `orders_uploads/${fileName}`;

        // ==========================
        // Insert to Database
        // ==========================

        const insertSql = `
          INSERT INTO orders (
            id,
            userId,
            name,
            address,
            location,
            phone,
            type,
            remark,
            orders,
            total_order,
            discount,
            tax,
            extra,
            grand_total,
            payment_method,
            payment_phone,
            payment_name,
            payment_photo
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          newOrderId,
          userId,
          name,
          address,
          location,
          phone,
          type || "Normal",
          remark || null,
          JSON.stringify(ordersArray),
          total_order || 0,
          discount || 0,
          tax || 0,
          extra || 0,
          grand_total,
          payment_method,
          payment_phone,
          payment_name,
          relativePath
        ];

        db.query(insertSql, values, (err) => {
          if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ success: false, message: "Database error", error: err }));
          }

          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              message: "သင့် Order အောင်မြင်စွာ မှာယူပြီးပါပြီ ကျေးဇူးပြု၍ ဆိုင်ဘက်မှ reply ကို စောင့်ပေးပါ",
              orderId: newOrderId,
              photo: relativePath
            })
          );
        });
      });

    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, message: "Invalid JSON format" }));
    }
  });
}

module.exports = { postOrder };