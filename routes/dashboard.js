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
    // HOURLY REPORT
    // =========================

    const hourMap = {};

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
    // Jan -> Dec
    // =========================

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const yearlyMap = {};

    for (let i = 0; i < 12; i++) {

      yearlyMap[i] = {
        time: monthNames[i],
        value: 0
      };
    }

    // =========================
    // TODAY
    // =========================

    const today = new Date();

    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    const currentYear = today.getFullYear();

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

      if (created.getFullYear() === currentYear) {

        const monthIndex = created.getMonth();

        yearlyMap[monthIndex].value += revenue;
      }

    });

    // =========================
    // RESPONSE
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

function getReportCategoriesChartByShopId(req, res, shopId) {
  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        success: false,
        message: "shopId is required",
      })
    );
  }

  // 1. Get all orders for this shop
  const ordersSql = `
    SELECT id, orders
    FROM orders
    WHERE shopId = ?
  `;

  db.query(ordersSql, [shopId], (err, orderResults) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          success: false,
          message: "Database error",
          error: err.message,
        })
      );
    }

    // 2. Get all menu categories
    const menuSql = `
      SELECT id, category
      FROM menu
    `;

    db.query(menuSql, (menuErr, menuResults) => {
      if (menuErr) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            success: false,
            message: "Database error",
            error: menuErr.message,
          })
        );
      }

      // 3. Get category names
      const categoriesSql = `
        SELECT id, name
        FROM categories
      `;

      db.query(categoriesSql, (catErr, categoryResults) => {
        if (catErr) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              success: false,
              message: "Database error",
              error: catErr.message,
            })
          );
        }

        // =========================
        // Create menu -> category map
        // =========================
        const menuCategoryMap = {};

        menuResults.forEach((menu) => {
          menuCategoryMap[menu.id] = menu.category;
        });

        // =========================
        // Create categoryId -> name map
        // =========================
        const categoryNameMap = {};

        categoryResults.forEach((cat) => {
          categoryNameMap[cat.id] = cat.name;
        });

        // =========================
        // Final category totals
        // =========================
        const categoryChart = {};

        orderResults.forEach((orderRow) => {
          let orderItems = [];

          try {
            orderItems =
              typeof orderRow.orders === "string"
                ? JSON.parse(orderRow.orders)
                : orderRow.orders;
          } catch (e) {
            orderItems = [];
          }

          if (!Array.isArray(orderItems)) return;

          orderItems.forEach((item) => {
            const menuId = item.menu_id;
            const quantity = Number(item.quantity || 0);

            // Get category id from menu table
            const categoryId = menuCategoryMap[menuId];

            if (!categoryId) return;

            // Get category name
            const categoryName = categoryNameMap[categoryId];

            if (!categoryName) return;

            // Add quantity count
            if (!categoryChart[categoryName]) {
              categoryChart[categoryName] = 0;
            }

            categoryChart[categoryName] += quantity;
          });
        });

        // =========================
        // Response
        // =========================
        res.writeHead(200, { "Content-Type": "application/json" });

        return res.end(
          JSON.stringify({
            success: true,
            data: categoryChart,
          })
        );
      });
    });
  });
}

const top5MenuByShopId = async (req, res, shopId) => {
    try {
        // Get all orders for this shop
        const [ordersRows] = await db.promise().execute(
            `SELECT orders FROM orders WHERE shopId = ?`,
            [shopId]
        );

        // Get menu + category info
        const [menuRows] = await db.promise().execute(`
            SELECT 
                m.id,
                m.name,
                c.name AS category
            FROM menu m
            LEFT JOIN categories c 
                ON m.category = c.id
            WHERE m.shop_id = ?
        `, [shopId]);

        // Create menu map
        const menuMap = {};

        for (const menu of menuRows) {
            menuMap[menu.id] = {
                name: menu.name,
                category: menu.category || "Unknown",
                orders: 0
            };
        }

        // Count menu quantities from orders JSON
        for (const row of ordersRows) {
            let orderItems = [];

            try {
                orderItems =
                    typeof row.orders === "string"
                        ? JSON.parse(row.orders)
                        : row.orders;
            } catch (err) {
                continue;
            }

            if (!Array.isArray(orderItems)) continue;

            for (const item of orderItems) {
                const menuId = item.menu_id;
                const quantity = Number(item.quantity || 0);

                if (menuMap[menuId]) {
                    menuMap[menuId].orders += quantity;
                }
            }
        }

        // Convert object to array
        const result = Object.values(menuMap)
            .sort((a, b) => b.orders - a.orders)
            .slice(0, 5);

        return res.end(JSON.stringify({
            success: true,
            data: result
        }));

    } catch (error) {
        console.error(error);

        return res.end(JSON.stringify({
            success: false,
            message: "Database error",
            error: error.message
        }));
    }
};

const dashboardOrdersValuesChartByShopId = async (req, res, shopId) => {
  try {
    // Hourly (today)
    const [hourRows] = await db.promise().query(
      `
      SELECT 
        HOUR(created_at) AS hour,
        COALESCE(SUM(grand_total), 0) AS total
      FROM orders
      WHERE shopId = ?
        AND DATE(created_at) = CURDATE()
      GROUP BY HOUR(created_at)
      ORDER BY hour ASC
      `,
      [shopId]
    );

    // Weekly (current week)
    const [weeklyRows] = await db.promise().query(
      `
      SELECT 
        DAYOFWEEK(created_at) AS day_number,
        COALESCE(SUM(grand_total), 0) AS total
      FROM orders
      WHERE shopId = ?
        AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
      GROUP BY DAYOFWEEK(created_at)
      ORDER BY day_number ASC
      `,
      [shopId]
    );

    // Yearly (current year)
    const [yearlyRows] = await db.promise().query(
      `
      SELECT 
        MONTH(created_at) AS month_number,
        COALESCE(SUM(grand_total), 0) AS total
      FROM orders
      WHERE shopId = ?
        AND YEAR(created_at) = YEAR(CURDATE())
      GROUP BY MONTH(created_at)
      ORDER BY month_number ASC
      `,
      [shopId]
    );

    // -------------------------
    // Hour Labels
    // -------------------------
    const hour = [];

    for (let i = 0; i < 24; i++) {
      const found = hourRows.find((x) => x.hour === i);

      let label = "";

      if (i === 0) {
        label = "12 AM";
      } else if (i < 12) {
        label = `${i} AM`;
      } else if (i === 12) {
        label = "12 PM";
      } else {
        label = `${i - 12} PM`;
      }

      hour.push({
        time: label,
        value: found ? Number(found.total) : 0,
      });
    }

    // -------------------------
    // Weekly Labels
    // -------------------------
    const weekNames = [
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ];

    const weekly = [];

    for (let i = 1; i <= 7; i++) {
      const found = weeklyRows.find((x) => x.day_number === i);

      weekly.push({
        time: weekNames[i - 1],
        value: found ? Number(found.total) : 0,
      });
    }

    // -------------------------
    // Yearly Labels
    // -------------------------
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const yearly = [];

    for (let i = 1; i <= 12; i++) {
      const found = yearlyRows.find((x) => x.month_number === i);

      yearly.push({
        time: monthNames[i - 1],
        value: found ? Number(found.total) : 0,
      });
    }

    return res.end(
      JSON.stringify({
        success: true,
        data: {
          hour,
          weekly,
          yearly,
        },
      })
    );
  } catch (error) {
    console.log(error);

    return res.end(
      JSON.stringify({
        success: false,
        message: "Database error",
        error,
      })
    );
  }
};

const top5DeliverymenByShopId = async (req, res, shopId) => {
  try {
    // Current month range
    const now = new Date();

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    const query = `
      SELECT 
        d.id,
        d.name,
        d.phone,
        d.email,
        d.location,
        d.status,
        d.rating,
        d.photo,

        (
          COALESCE(
            (
              SELECT COUNT(*)
              FROM orders o
              WHERE JSON_CONTAINS(d.cleared_orders, JSON_QUOTE(o.id))
              AND o.created_at BETWEEN ? AND ?
            ),
            0
          )

          +

          COALESCE(
            (
              SELECT COUNT(*)
              FROM orders o
              WHERE JSON_CONTAINS(d.finished_orders, JSON_QUOTE(o.id))
              AND o.created_at BETWEEN ? AND ?
            ),
            0
          )
        ) AS total_order

      FROM deliverymen d
      WHERE d.work_type = ?
      ORDER BY total_order DESC
      LIMIT 5
    `;

    db.query(
      query,
      [
        startOfMonth,
        endOfMonth,
        startOfMonth,
        endOfMonth,
        shopId
      ],
      (err, results) => {
        if (err) {
          console.error(err);

          return res.end(
            JSON.stringify({
              success: false,
              message: "Database error",
              error: err.message
            })
          );
        }

        return res.end(
          JSON.stringify({
            success: true,
            data: results
          })
        );
      }
    );
  } catch (error) {
    console.error(error);

    return res.end(
      JSON.stringify({
        success: false,
        message: "Server error",
        error: error.message
      })
    );
  }
};

const top5LessMenuByShopId = async (req, res, shopId) => {
    try {
        // Get all orders for this shop
        const [ordersRows] = await db.promise().execute(
            `SELECT orders FROM orders WHERE shopId = ?`,
            [shopId]
        );

        // Get menu + category info
        const [menuRows] = await db.promise().execute(`
            SELECT 
                m.id,
                m.name,
                c.name AS category
            FROM menu m
            LEFT JOIN categories c 
                ON m.category = c.id
            WHERE m.shop_id = ?
        `, [shopId]);

        // Create menu map
        const menuMap = {};

        for (const menu of menuRows) {
            menuMap[menu.id] = {
                name: menu.name,
                category: menu.category || "Unknown",
                orders: 0
            };
        }

        // Count menu quantities from orders JSON
        for (const row of ordersRows) {
            let orderItems = [];

            try {
                orderItems =
                    typeof row.orders === "string"
                        ? JSON.parse(row.orders)
                        : row.orders;
            } catch (err) {
                continue;
            }

            if (!Array.isArray(orderItems)) continue;

            for (const item of orderItems) {
                const menuId = item.menu_id;
                const quantity = Number(item.quantity || 0);

                if (menuMap[menuId]) {
                    menuMap[menuId].orders += quantity;
                }
            }
        }

        // Convert object to array, sort ascending (least orders first), and slice 5
        const result = Object.values(menuMap)
            .sort((a, b) => a.orders - b.orders)
            .slice(0, 5);

        return res.end(JSON.stringify({
            success: true,
            data: result
        }));

    } catch (error) {
        console.error(error);

        return res.end(JSON.stringify({
            success: false,
            message: "Database error",
            error: error.message
        }));
    }
};

async function top5CustomerByShopId(req, res, shopId) {
  try {
    const sql = `
      SELECT 
        u.id,
        u.name,
        COUNT(o.id) AS total_orders,
        o.orders
      FROM orders o
      INNER JOIN users u ON u.id = o.userId
      WHERE o.shopId = ?
      GROUP BY u.id, u.name
      ORDER BY total_orders DESC
      LIMIT 5
    `;

    db.query(sql, [shopId], (err, results) => {
      if (err) {
        return res.end(
          JSON.stringify({
            success: false,
            message: "Database error",
            error: err.message
          })
        );
      }

      const customers = results.map((customer) => {
        let menuCount = {};

        try {
          const orders = JSON.parse(customer.orders || "[]");

          orders.forEach((item) => {
            const menuName = item.menu_name;

            if (!menuCount[menuName]) {
              menuCount[menuName] = 0;
            }

            menuCount[menuName] += item.quantity || 1;
          });
        } catch (e) {}

        // Find most ordered menu
        let mostOrderMenu = null;
        let highest = 0;

        for (const menu in menuCount) {
          if (menuCount[menu] > highest) {
            highest = menuCount[menu];
            mostOrderMenu = menu;
          }
        }

        return {
          name: customer.name,
          total_orders: customer.total_orders,
          most_order_menu: mostOrderMenu
        };
      });

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      res.end(
        JSON.stringify({
          success: true,
          customers
        })
      );
    });
  } catch (error) {
    res.writeHead(500, {
      "Content-Type": "application/json"
    });

    res.end(
      JSON.stringify({
        success: false,
        message: "Server error",
        error: error.message
      })
    );
  }
}

module.exports = { 
    getDashboardSummariesByShop,
    getReportRvenueByShopId,
    getReportCategoriesChartByShopId,
    top5MenuByShopId,
    dashboardOrdersValuesChartByShopId,
    top5DeliverymenByShopId,
    top5LessMenuByShopId,
    top5CustomerByShopId
};