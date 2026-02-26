const path = require("path");
const fs = require("fs");
const db = require("../db");
const { generateOrderId } = require("../utils/idOrderGenerator");

const UPLOAD_DIR = path.join(__dirname, "../orders_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function postOrder(req, res) {
  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const data = JSON.parse(body);

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
        payment_photo
      } = data;

      if (!userId || !orders || !grand_total || !payment_photo) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "Missing required fields"
        }));
      }

      const ordersArray = orders; // Already array from Flutter

      // ==========================
      // Generate Order ID
      // ==========================
      generateOrderId(db, (err, newOrderId) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            success: false,
            message: "ID generation error"
          }));
        }

        // ==========================
        // Base64 → Image Save
        // ==========================
        let base64Data = payment_photo;
        let extension = "png";

        const matches = base64Data.match(/^data:image\/(\w+);base64,/);
        if (matches) {
          extension = matches[1];
          base64Data = base64Data.replace(/^data:image\/\w+;base64,/, "");
        }

        const fileName = `${newOrderId}_${Date.now()}.${extension}`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        const buffer = Buffer.from(base64Data, "base64");
        fs.writeFileSync(filePath, buffer);

        const relativePath = `orders-uploads/${fileName}`;

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
            return res.end(JSON.stringify({
              success: false,
              message: "Database error",
              error: err
            }));
          }

          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            message: "သင့် Order အောင်မြင်စွာ မှာယူပြီးပါပြီ ကျေးဇူးပြု၍ ဆိုင်ဘက်မှ reply ကို စောင့်ပေးပါ",
            orderId: newOrderId,
            photo: relativePath
          }));
        });
      });

    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        message: "Invalid JSON format"
      }));
    }
  });
}

function getOrdersByShopId(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  const query = `
    SELECT DISTINCT
      o.id,
      o.userId,
      o.name,
      o.phone,
      o.type,
      o.remark,
      o.orders,
      o.created_at,
      o.orders_done
    FROM orders o,
    JSON_TABLE(
      o.orders,
      '$[*]' COLUMNS (
        shop_id VARCHAR(50) PATH '$.shop_id'
      )
    ) jt
    WHERE jt.shop_id = ? ORDER BY o.id DESC
  `;

  db.query(query, [shopId], (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: err.sqlMessage || "Database error"
      }));
    }

    const finalResult = results.map(row => {

      let items = [];

      try {
        if (typeof row.orders === "string") {
          items = JSON.parse(row.orders);
        } else if (Array.isArray(row.orders)) {
          items = row.orders;
        } else {
          items = [];
        }
      } catch (e) {
        items = [];
      }

      const matchedItems = items.filter(item =>
        String(item.shop_id).trim() === String(shopId).trim()
      );

      return {
        id: row.id,
        userId: row.userId,
        name: row.name,
        phone: row.phone,
        type: row.type,
        remark: row.remark,
        created_at: row.created_at,
        orders_done: row.orders_done,
        orders: matchedItems
      };

    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      data: finalResult
    }));

  });

}

async function approvedOrder(req, res) {
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", async () => {
    try {

      const parsedBody = JSON.parse(body);
      const { orderId, menu_id } = parsedBody;

      if (!orderId || !menu_id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "orderId and menu_id required" }));
      }

      const [rows] = await db.promise().query(
        "SELECT orders FROM orders WHERE id = ?",
        [orderId]
      );

      if (rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Order not found" }));
      }

      let orderItems = rows[0].orders;

      // 🛡 FIX HERE
      if (typeof orderItems === "string") {
        orderItems = JSON.parse(orderItems);
      }

      let found = false;

      orderItems = orderItems.map(item => {
        if (item.menu_id === menu_id) {
          item.status = 1;
          found = true;
        }
        return item;
      });

      if (!found) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Menu item not found in order" }));
      }

      await db.promise().query(
        "UPDATE orders SET orders = ? WHERE id = ?",
        [JSON.stringify(orderItems), orderId]
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Order item approved successfully" }));

    } catch (err) {
      console.error("ERROR:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Server error" }));
    }
  });
}


async function rejectedOrder(req, res) {
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", async () => {
    try {

      const parsedBody = JSON.parse(body);
      const { orderId, menu_id } = parsedBody;

      if (!orderId || !menu_id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "orderId and menu_id required" }));
      }

      const [rows] = await db.promise().query(
        "SELECT orders FROM orders WHERE id = ?",
        [orderId]
      );

      if (rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Order not found" }));
      }

      let orderItems = rows[0].orders;

      // If MySQL returns string
      if (typeof orderItems === "string") {
        orderItems = JSON.parse(orderItems);
      }

      let found = false;

      orderItems = orderItems.map(item => {
        if (item.menu_id === menu_id) {
          item.status = 2; // 🔴 Rejected
          found = true;
        }
        return item;
      });

      if (!found) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Menu item not found in order" }));
      }

      await db.promise().query(
        "UPDATE orders SET orders = ? WHERE id = ?",
        [JSON.stringify(orderItems), orderId]
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Order item rejected successfully" }));

    } catch (err) {
      console.error("ERROR:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Server error" }));
    }
  });
}

async function approveAllOrderItems(req, res, orderId) {
  try {

    if (!orderId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "orderId required" }));
    }

    const [rows] = await db.promise().query(
      "SELECT orders FROM orders WHERE id = ?",
      [orderId]
    );

    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Order not found" }));
    }

    let orderItems = rows[0].orders;

    if (typeof orderItems === "string") {
      orderItems = JSON.parse(orderItems);
    }

    // ✅ All → Approved
    orderItems = orderItems.map(item => ({
      ...item,
      status: 1
    }));

    await db.promise().query(
      "UPDATE orders SET orders = ? WHERE id = ?",
      [JSON.stringify(orderItems), orderId]
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "All order items approved successfully" }));

  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Server error" }));
  }
}

async function rejectAllOrderItems(req, res, orderId) {
  try {

    if (!orderId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "orderId required" }));
    }

    const [rows] = await db.promise().query(
      "SELECT orders FROM orders WHERE id = ?",
      [orderId]
    );

    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Order not found" }));
    }

    let orderItems = rows[0].orders;

    if (typeof orderItems === "string") {
      orderItems = JSON.parse(orderItems);
    }

    // 🔴 All → Rejected
    orderItems = orderItems.map(item => ({
      ...item,
      status: 2
    }));

    await db.promise().query(
      "UPDATE orders SET orders = ? WHERE id = ?",
      [JSON.stringify(orderItems), orderId]
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "All order items rejected successfully" }));

  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Server error" }));
  }
}

function getAllOrders(req, res) {

  const query = `
    SELECT 
      o.*
    FROM orders o
    JOIN JSON_TABLE(
      o.orders,
      '$[*]' COLUMNS (
        status INT PATH '$.status'
      )
    ) jt
    WHERE o.orders_done = 0 AND o.connected_deliveryman = 0
    GROUP BY o.id
    HAVING COUNT(*) = SUM(CASE WHEN jt.status = 1 THEN 1 ELSE 0 END)
    ORDER BY o.id DESC
  `;

  db.query(query, (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Database error",
        error: err.message
      }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      count: results.length,
      data: results
    }));

  });

}

module.exports = { postOrder, getOrdersByShopId, approvedOrder, rejectedOrder, approveAllOrderItems, rejectAllOrderItems, getAllOrders };