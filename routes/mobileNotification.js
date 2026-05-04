const db = require("../db");

function getNotiUser(req, res, userId) {
  if (!userId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "userId is required"
    }));
  }

  const query = `
    SELECT 
      id,
      connected_deliveryman,
      connected_deliveryman_seen,
      orders_pickup,
      orders_pickup_seen,
      orders_done,
      orders_done_seen
    FROM orders
    WHERE userId = ?
    ORDER BY created_at DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: err.message
      }));
    }

    let data = [];
    let unseenCount = 0;
    let notiId = 1;

    results.forEach(order => {

      // 1. Deliveryman confirmed
      if (order.connected_deliveryman == 1) {
        if (order.connected_deliveryman_seen == 0) unseenCount++;

        data.push({
          id: "N" + String(notiId++).padStart(3, "0"),
          title: "Delivery Confirmed",
          Des: `သင့်အော်ဒါ #${order.id} ကို ဆိုင်မှ လက်ခံလိုက်ပါပြီ။`,
          connected_deliveryman_seen: order.connected_deliveryman_seen
        });
      }

      // 2. Pickup
      if (order.orders_pickup == 1) {
        if (order.orders_pickup_seen == 0) unseenCount++;

        data.push({
          id: "N" + String(notiId++).padStart(3, "0"),
          title: "Order pickup",
          Des: `သင့်အော်ဒါ #${order.id} ကို Delivery သမားက ဆိုင်မှ ယူဆောင်သွားပါပြီ။`,
          orders_pickup_seen: order.orders_pickup_seen
        });
      }

      // 3. Done
      if (order.orders_done == 1) {
        if (order.orders_done_seen == 0) unseenCount++;

        data.push({
          id: "N" + String(notiId++).padStart(3, "0"),
          title: "Order Done",
          Des: `သင့်အော်ဒါ #${order.id} ကို အောင်မြင်စွာ ပို့ဆောင်ပြီးပါပြီ။`,
          orders_done_seen: order.orders_done_seen
        });
      }

    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      unseenNofi: unseenCount.toString(),
      data: {
        "orders": data,
        "system": []
      }
    }));
  });
}

function mobileNotiSeen(req, res, id) {
  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Order id is required"
    }));
  }

  let body = "";

  // Collect request data
  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", () => {
    let data;

    try {
      data = JSON.parse(body);
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Invalid JSON"
      }));
    }

    const { seen_type } = data;

    if (!seen_type) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "seen_type is required"
      }));
    }

    if (seen_type !== 'connected_deliveryman_seen' && seen_type !== 'orders_pickup_seen' && seen_type !== 'orders_done_seen') {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "seen_type must be connected_deliveryman_seen or orders_pickup_seen or orders_done_seen."
      }));
    }

    const query = `
      UPDATE orders
      SET ${seen_type} = 1
      WHERE id = ?
    `;

    db.query(query, [id], (err, result) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: err.message
        }));
      }

      if (result.affectedRows === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "Order not found"
        }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: true,
        message: "Notification seen successfully"
      }));
    });
  });
}

module.exports = { 
    getNotiUser,
    mobileNotiSeen
};