const db = require("../db");

function getDashboardSummariesByShop(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  const today = new Date().toLocaleDateString("en-CA");

  const query = `
    SELECT 
      id,
      orders,
      grand_total,
      userId,
      delivery_fees,
      shopId,
      created_at
    FROM orders
    WHERE shopId = ?
    AND DATE(created_at) = ?
  `;

  db.query(query, [shopId, today], (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: err.message
      }));
    }

    let uniqueMenus = new Set();
    let uniqueUsers = new Set();

    let today_amount = 0;
    let today_delivery_fees = 0;

    results.forEach(order => {

      // users
      if (order.userId) {
        uniqueUsers.add(order.userId);
      }

      // totals
      today_amount += Number(order.grand_total || 0);
      today_delivery_fees += Number(order.delivery_fees || 0);

      // orders json
      let orderItems = [];

      try {

        if (typeof order.orders === "string") {
          orderItems = JSON.parse(order.orders);
        } else if (Array.isArray(order.orders)) {
          orderItems = order.orders;
        }

      } catch (e) {
        orderItems = [];
      }

      // menus
      orderItems.forEach(item => {

        if (item.menu_id) {
          uniqueMenus.add(item.menu_id);
        }

      });

    });

    const data = {
      today_menu_count: uniqueMenus.size,
      today_users_count: uniqueUsers.size,
      today_amount,
      today_delivery_fees,
      today_profits: today_amount - today_delivery_fees
    };

    res.writeHead(200, { "Content-Type": "application/json" });

    return res.end(JSON.stringify({
      success: true,
      data
    }));

  });

}

function getReportRvenueByShopId(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  const query = `
    SELECT id, shopId, grand_total, delivery_fees, created_at
    FROM orders
    WHERE shopId = ?
  `;

  db.query(query, [shopId], (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Database error",
        error: err.message
      }));
    }

    // =========================
    // HOURLY REPORT (Today)
    // =========================

    const hourMap = {};

    // 6 AM to 8 PM
    for (let hour = 6; hour <= 20; hour++) {

      let label = "";

      if (hour === 12) {
        label = "12 PM";
      } else if (hour > 12) {
        label = `${hour - 12} PM`;
      } else {
        label = `${hour} AM`;
      }

      hourMap[hour] = {
        time: label,
        value: 0
      };
    }

    // =========================
    // WEEKLY REPORT
    // =========================

    const weeklyNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const weeklyMap = {
      Mon: { time: "Mon", value: 0 },
      Tue: { time: "Tue", value: 0 },
      Wed: { time: "Wed", value: 0 },
      Thu: { time: "Thu", value: 0 },
      Fri: { time: "Fri", value: 0 },
      Sat: { time: "Sat", value: 0 },
      Sun: { time: "Sun", value: 0 }
    };

    // =========================
    // YEARLY REPORT
    // Last 5 months + current month
    // =========================

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const yearlyMap = {};

    const currentDate = new Date();

    // create last 5 months + current month
    for (let i = 5; i >= 0; i--) {

      const d = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i,
        1
      );

      const key = `${d.getFullYear()}-${d.getMonth()}`;

      yearlyMap[key] = {
        time: monthNames[d.getMonth()],
        value: 0
      };
    }

    // =========================
    // TODAY DATE
    // =========================

    const today = new Date();

    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    // =========================
    // LOOP ORDERS
    // =========================

    results.forEach(order => {

      const created = new Date(order.created_at);

      const revenue =
        Number(order.grand_total || 0) -
        Number(order.delivery_fees || 0);

      // =====================
      // HOURLY
      // =====================

      if (
        created.getFullYear() === todayYear &&
        created.getMonth() === todayMonth &&
        created.getDate() === todayDate
      ) {

        const hour = created.getHours();

        if (hourMap[hour]) {
          hourMap[hour].value += revenue;
        }
      }

      // =====================
      // WEEKLY
      // =====================

      const dayName = weeklyNames[created.getDay()];

      if (weeklyMap[dayName]) {
        weeklyMap[dayName].value += revenue;
      }

      // =====================
      // YEARLY
      // =====================

      const monthKey = `${created.getFullYear()}-${created.getMonth()}`;

      if (yearlyMap[monthKey]) {
        yearlyMap[monthKey].value += revenue;
      }

    });

    // =========================
    // FINAL RESPONSE
    // =========================

    const response = {
      success: true,
      data: {
        hour: Object.values(hourMap),

        weekly: [
          weeklyMap.Mon,
          weeklyMap.Tue,
          weeklyMap.Wed,
          weeklyMap.Thu,
          weeklyMap.Fri,
          weeklyMap.Sat,
          weeklyMap.Sun
        ],

        yearly: Object.values(yearlyMap)
      }
    };

    res.writeHead(200, { "Content-Type": "application/json" });

    return res.end(JSON.stringify(response));

  });

}

module.exports = { 
    getDashboardSummariesByShop,
    getReportRvenueByShopId
};