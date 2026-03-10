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
        timer,
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
            timer,
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          newOrderId,
          userId,
          name,
          address,
          location,
          phone,
          type || "Normal",
          timer || null,
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
      o.timer,
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
        timer: row.timer,
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
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const { shopId } = JSON.parse(body);

      if (!orderId || !shopId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "orderId and shopId required" }));
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

      // ✅ Only approve items with same shopId
      orderItems = orderItems.map(item => {
        if (item.shop_id === shopId) {
          return { ...item, status: 1 };
        }
        return item;
      });

      await db.promise().query(
        "UPDATE orders SET orders = ? WHERE id = ?",
        [JSON.stringify(orderItems), orderId]
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Shop order items approved successfully" }));

    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Server error" }));
    }
  });
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

function getAllSpecialOrders(req, res) {

  const query = `
    SELECT 
      o.*
    FROM orders o
    JOIN users u ON o.userId = u.id
    JOIN JSON_TABLE(
      o.orders,
      '$[*]' COLUMNS (
        status INT PATH '$.status'
      )
    ) jt
    WHERE 
      o.orders_done = 0
      AND o.connected_deliveryman = 0
      AND u.special = 1
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

function getAllOrders(req, res) {

  const query = `
    SELECT 
      o.*
    FROM orders o
    JOIN users u ON o.userId = u.id
    JOIN JSON_TABLE(
      o.orders,
      '$[*]' COLUMNS (
        status INT PATH '$.status'
      )
    ) jt
    WHERE 
      o.orders_done = 0
      AND o.connected_deliveryman = 0
      AND u.special = 0
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

async function connectedDeliverymen(req, res) {
  try {
    const [deliverymen] = await db.promise().query(
      "SELECT * FROM deliverymen WHERE current_orders IS NOT NULL"
    );

    const result = [];

    for (let dm of deliverymen) {

      let orderIds = [];

      // 🔹 Important Fix Here
      if (dm.current_orders) {
        if (Array.isArray(dm.current_orders)) {
          orderIds = dm.current_orders; // already parsed
        } else if (typeof dm.current_orders === "string") {
          orderIds = JSON.parse(dm.current_orders);
        }
      }

      let ordersData = [];

      if (orderIds.length > 0) {
        const placeholders = orderIds.map(() => "?").join(",");

        const [orders] = await db.promise().query(
          `SELECT * FROM orders WHERE id IN (${placeholders})`,
          orderIds
        );

        ordersData = orders;
      }

      result.push({
        id: dm.id,
        name: dm.name,
        email: dm.email,
        phone: dm.phone,
        work_type: dm.work_type,
        location: dm.location,
        status: dm.status,
        rating: dm.rating,
        finished_order_count: dm.finished_order_count,
        is_online: dm.is_online,
        assign_order: dm.assign_order,
        current_orders: orderIds,
        orders: ordersData
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      count: result.length,
      data: result
    }));

  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function finishOrder(req, res, orderId) {
  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", async () => {

    // JSON parse safe
    let data;
    try {
      data = JSON.parse(body);
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        error: "Invalid JSON body"
      }));
    }

    const { esign, deliverymanId } = data;

    if (!esign || !deliverymanId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        error: "esign and deliverymanId required"
      }));
    }

    try {

      // base64 → image
      const base64Data = esign.replace(/^data:image\/\w+;base64,/, "");

      const fileName = `esign_${Date.now()}.png`;
      const uploadDir = path.join(__dirname, "../orders_uploads");

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, fileName);

      fs.writeFileSync(filePath, base64Data, "base64");

      const imagePath = `/orders_uploads/${fileName}`;

      // update order
      await db.promise().query(
        `UPDATE orders 
         SET orders_done = 1, esign = ?
         WHERE id = ?`,
        [imagePath, orderId]
      );

      // get deliveryman
      const [rows] = await db.promise().query(
        `SELECT current_orders, finished_orders 
         FROM deliverymen 
         WHERE id = ?`,
        [deliverymanId]
      );

      if (rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          error: "Deliveryman not found"
        }));
      }

      const deliveryman = rows[0];

      let currentOrders = [];
      let finishedOrders = [];

      // parse current_orders safely
      if (deliveryman.current_orders) {
        try {
          currentOrders = JSON.parse(deliveryman.current_orders);
        } catch {
          currentOrders = [];
        }
      }

      // parse finished_orders safely
      if (deliveryman.finished_orders) {
        try {
          finishedOrders = JSON.parse(deliveryman.finished_orders);
        } catch {
          finishedOrders = [];
        }
      }

      // remove from current_orders
      currentOrders = currentOrders.filter(id => id !== orderId);

      // add to finished_orders
      finishedOrders.push(orderId);

      const currentOrdersValue =
        currentOrders.length === 0 ? null : JSON.stringify(currentOrders);

      const finishedOrdersValue = JSON.stringify(finishedOrders);

      // update deliveryman
      await db.promise().query(
        `UPDATE deliverymen 
         SET current_orders = ?, 
             finished_orders = ?, 
             finished_order_count = finished_order_count + 1,
             assign_order = GREATEST(assign_order - 1, 0)
         WHERE id = ?`,
        [
          currentOrdersValue,
          finishedOrdersValue,
          deliverymanId
        ]
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        message: "Order finished successfully"
      }));

    } catch (error) {

      console.error(error);

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error: "Server error"
      }));

    }

  });
}

async function getReport(req, res) {
  try {

    // orders_done = 1 orders
    const [orders] = await db.promise().query(
      "SELECT * FROM orders WHERE orders_done = 1"
    );

    // password မပါအောင် select
    const [deliverymen] = await db.promise().query(`
      SELECT id,name,email,phone
      FROM deliverymen
    `);

    const report = [];

    for (let order of orders) {

      let deliverymanInfo = null;

      for (let dm of deliverymen) {

        if (!dm.finished_orders) continue;

        let finishedOrders;

        try {
          finishedOrders = JSON.parse(dm.finished_orders);
        } catch {
          finishedOrders = [];
        }

        if (finishedOrders.includes(order.id)) {
          deliverymanInfo = dm;
          break;
        }

      }

      report.push({
        order: order,
        deliveryman: deliverymanInfo
      });

    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      total: report.length,
      data: report
    }));

  } catch (err) {

    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: false,
      error: err.message
    }));

  }
}

module.exports = { postOrder, getOrdersByShopId, approvedOrder, rejectedOrder, approveAllOrderItems, rejectAllOrderItems, getAllSpecialOrders, getAllOrders, connectedDeliverymen, finishOrder, getReport };