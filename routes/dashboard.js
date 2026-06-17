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
        o.orders
      FROM orders o
      INNER JOIN users u ON u.id = o.userId
      WHERE o.shopId = ?
      ORDER BY u.name ASC
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

      const customerMap = {};

      results.forEach((row) => {
        if (!customerMap[row.id]) {
          customerMap[row.id] = {
            name: row.name,
            total_orders: 0,
            menuCount: {}
          };
        }

        customerMap[row.id].total_orders += 1;

        try {
          let orders = [];

          try {
            orders =
              typeof row.orders === "string"
                ? JSON.parse(row.orders)
                : row.orders;

            orders.forEach((item) => {
              const menuName = item.menu_name;
              const quantity = item.quantity || 1;

              if (!customerMap[row.id].menuCount[menuName]) {
                customerMap[row.id].menuCount[menuName] = 0;
              }

              customerMap[row.id].menuCount[menuName] += quantity;
            });
          } catch (e) {
            console.log("Orders Parse Error:", e);
          }

          orders.forEach((item) => {
            const menuName = item.menu_name;
            const quantity = item.quantity || 1;

            if (!customerMap[row.id].menuCount[menuName]) {
              customerMap[row.id].menuCount[menuName] = 0;
            }

            customerMap[row.id].menuCount[menuName] += quantity;
          });
        } catch (e) {}
      });

      const customers = Object.values(customerMap)
        .map((customer) => {
          let mostOrderMenu = null;
          let highest = 0;

          for (const menu in customer.menuCount) {
            if (customer.menuCount[menu] > highest) {
              highest = customer.menuCount[menu];
              mostOrderMenu = menu;
            }
          }

          return {
            name: customer.name,
            total_orders: customer.total_orders,
            most_order_menu: mostOrderMenu
          };
        })
        .sort((a, b) => b.total_orders - a.total_orders)
        .slice(0, 5);

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

async function ordersSummaries(req, res, shopId) {
  try {
    const query = `
      SELECT
        COUNT(*) AS total_orders_today,

        SUM(
          CASE
            WHEN LOWER(type) = 'timer' THEN 1
            ELSE 0
          END
        ) AS time_orders_today,

        SUM(
          CASE
            WHEN LOWER(type) != 'timer' THEN 1
            ELSE 0
          END
        ) AS normal_orders_today,

        (
          SELECT COUNT(DISTINCT o2.id)
          FROM orders o2
          JOIN JSON_TABLE(
            o2.orders,
            '$[*]' COLUMNS (
              status INT PATH '$.status'
            )
          ) jt
          ON TRUE
          WHERE o2.shopId = ?
            AND DATE(o2.created_at) = CURDATE()
            AND jt.status = 1
        ) AS approve_orders_today

      FROM orders
      WHERE shopId = ?
        AND DATE(created_at) = CURDATE()
    `;

    const [rows] = await db.promise().query(query, [shopId, shopId]);

    const data = {
      total_orders_today: Number(rows[0].total_orders_today || 0),
      time_orders_today: Number(rows[0].time_orders_today || 0),
      normal_orders_today: Number(rows[0].normal_orders_today || 0),
      approve_orders_today: Number(rows[0].approve_orders_today || 0),
    };

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        success: true,
        data,
      })
    );
  } catch (error) {
    res.writeHead(500, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        success: false,
        message: "Database error",
        error: error.message,
      })
    );
  }
}

async function deliverymenSummaries(req, res, shopId) {
  try {
    const query = `
      SELECT
        COUNT(*) AS total_deliverymen,

        SUM(
          CASE
            WHEN is_online = 1 THEN 1
            ELSE 0
          END
        ) AS total_online_deliverymen,

        SUM(
          CASE
            WHEN is_online = 0 THEN 1
            ELSE 0
          END
        ) AS total_offline_deliverymen,

        SUM(
          CASE
            WHEN DATE(created_at) = CURDATE() THEN 1
            ELSE 0
          END
        ) AS today_deliverymen

      FROM deliverymen
      WHERE work_type = ?
    `;

    const [rows] = await db.promise().query(query, [shopId]);

    const data = {
      total_deliverymen: Number(rows[0].total_deliverymen || 0),
      total_online_deliverymen: Number(rows[0].total_online_deliverymen || 0),
      total_offline_deliverymen: Number(rows[0].total_offline_deliverymen || 0),
      today_deliverymen: Number(rows[0].today_deliverymen || 0),
    };

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        success: true,
        data,
      })
    );
  } catch (error) {
    res.writeHead(500, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        success: false,
        message: "Database error",
        error: error.message,
      })
    );
  }
}

async function paymentsChartByShop(req, res, shopId) {
  res.setHeader("Content-Type", "application/json");

  if (!shopId) {
    res.statusCode = 400;
    return res.end(
      JSON.stringify({
        success: false,
        message: "Shop ID is required"
      })
    );
  }

  try {
    const [rows] = await db.promise().query(
      `
      SELECT
        payment_method AS method,
        COUNT(*) AS total
      FROM orders
      WHERE shopId = ?
        AND payment_method IS NOT NULL
        AND payment_method <> ''
      GROUP BY payment_method
      ORDER BY total DESC
      `,
      [shopId]
    );

    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        success: true,
        data: rows
      })
    );
  } catch (error) {
    console.error(error);

    res.statusCode = 500;
    return res.end(
      JSON.stringify({
        success: false,
        message: "Internal server error"
      })
    );
  }
}

function systemDashboardSummaries(req, res) {
  res.writeHead(200, { "Content-Type": "application/json" });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const dashboard = {
    total_shops: {
      total: 0,
      new_shops: 0
    },
    total_menu: {
      total: 0,
      new_menu: 0
    },
    total_client: {
      total: 0,
      new_users: 0
    },
    total_delivery_income_today: {
      today_system_income: 0,
      yesterday_system_income: 0
    },
    total_deliverymen: {
      total: 0,
      new_deliverymen: 0
    }
  };

  const queries = [
    // Shops
    cb => {
      db.query(
        `SELECT
            COUNT(*) AS total,
            SUM(
              CASE
                WHEN created_at >= ? AND created_at < ?
                THEN 1 ELSE 0
              END
            ) AS new_shops
         FROM shops`,
        [todayStart, tomorrowStart],
        (err, rows) => {
          if (!err && rows.length) {
            dashboard.total_shops.total = rows[0].total || 0;
            dashboard.total_shops.new_shops = rows[0].new_shops || 0;
          }
          cb(err);
        }
      );
    },

    // Menu
    cb => {
      db.query(
        `SELECT
            COUNT(*) AS total,
            SUM(
              CASE
                WHEN created_at >= ? AND created_at < ?
                THEN 1 ELSE 0
              END
            ) AS new_menu
         FROM menu`,
        [todayStart, tomorrowStart],
        (err, rows) => {
          if (!err && rows.length) {
            dashboard.total_menu.total = rows[0].total || 0;
            dashboard.total_menu.new_menu = rows[0].new_menu || 0;
          }
          cb(err);
        }
      );
    },

    // Users
    cb => {
      db.query(
        `SELECT
            COUNT(*) AS total,
            SUM(
              CASE
                WHEN created_at >= ? AND created_at < ?
                THEN 1 ELSE 0
              END
            ) AS new_users
         FROM users`,
        [todayStart, tomorrowStart],
        (err, rows) => {
          if (!err && rows.length) {
            dashboard.total_client.total = rows[0].total || 0;
            dashboard.total_client.new_users = rows[0].new_users || 0;
          }
          cb(err);
        }
      );
    },

    // Today's system delivery income
    cb => {
      db.query(
        `SELECT COALESCE(SUM(o.delivery_fees),0) AS income
         FROM orders o
         LEFT JOIN deliverymen d ON o.deliverymenId = d.id
         WHERE d.work_type IS NULL
           AND o.created_at >= ?
           AND o.created_at < ?`,
        [todayStart, tomorrowStart],
        (err, rows) => {
          if (!err && rows.length) {
            dashboard.total_delivery_income_today.today_system_income =
              rows[0].income || 0;
          }
          cb(err);
        }
      );
    },

    // Yesterday's system delivery income
    cb => {
      db.query(
        `SELECT COALESCE(SUM(o.delivery_fees),0) AS income
         FROM orders o
         LEFT JOIN deliverymen d ON o.deliverymenId = d.id
         WHERE d.work_type IS NULL
           AND o.created_at >= ?
           AND o.created_at < ?`,
        [yesterdayStart, todayStart],
        (err, rows) => {
          if (!err && rows.length) {
            dashboard.total_delivery_income_today.yesterday_system_income =
              rows[0].income || 0;
          }
          cb(err);
        }
      );
    },

    // Deliverymen (system deliverymen only)
    cb => {
      db.query(
        `SELECT
            COUNT(*) AS total,
            SUM(
              CASE
                WHEN created_at >= ? AND created_at < ?
                THEN 1 ELSE 0
              END
            ) AS new_deliverymen
         FROM deliverymen
         WHERE work_type IS NULL`,
        [todayStart, tomorrowStart],
        (err, rows) => {
          if (!err && rows.length) {
            dashboard.total_deliverymen.total = rows[0].total || 0;
            dashboard.total_deliverymen.new_deliverymen =
              rows[0].new_deliverymen || 0;
          }
          cb(err);
        }
      );
    }
  ];

  let completed = 0;

  queries.forEach(query => {
    query(err => {
      if (err) {
        console.error(err);
      }

      completed++;

      if (completed === queries.length) {
        res.end(
          JSON.stringify({
            success: true,
            data: dashboard
          })
        );
      }
    });
  });
}

function systemOrderChart(req, res) {
  res.writeHead(200, { "Content-Type": "application/json" });

  const data = {
    day: [],
    week: [],
    month: [],
    year: []
  };

  // ---------- DAY ----------
  const daySql = `
    SELECT
      HOUR(created_at) AS hour,
      COUNT(*) AS total
    FROM orders
    WHERE DATE(created_at) = CURDATE()
    GROUP BY HOUR(created_at)
  `;

  // ---------- WEEK ----------
  const weekSql = `
    SELECT
      WEEKDAY(created_at) AS weekday,
      COUNT(*) AS total
    FROM orders
    WHERE YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
    GROUP BY WEEKDAY(created_at)
  `;

  // ---------- MONTH ----------
  const monthSql = `
    SELECT
      DAY(created_at) AS day_no,
      COUNT(*) AS total
    FROM orders
    WHERE YEAR(created_at) = YEAR(CURDATE())
      AND MONTH(created_at) = MONTH(CURDATE())
    GROUP BY DAY(created_at)
  `;

  // ---------- YEAR ----------
  const yearSql = `
    SELECT
      MONTH(created_at) AS month_no,
      COUNT(*) AS total
    FROM orders
    WHERE YEAR(created_at) = YEAR(CURDATE())
    GROUP BY MONTH(created_at)
  `;

  db.query(daySql, (err, dayRows) => {
    if (err) {
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }

    for (let i = 0; i < 24; i++) {
      const row = dayRows.find(r => r.hour === i);

      data.day.push({
        name: `${String(i).padStart(2, "0")}:00`,
        value: row ? row.total : 0
      });
    }

    db.query(weekSql, (err, weekRows) => {
      if (err) {
        return res.end(JSON.stringify({
          success: false,
          error: err.message
        }));
      }

      const weekNames = [
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat",
        "Sun"
      ];

      for (let i = 0; i < 7; i++) {
        const row = weekRows.find(r => r.weekday === i);

        data.week.push({
          name: weekNames[i],
          value: row ? row.total : 0
        });
      }

      db.query(monthSql, (err, monthRows) => {
        if (err) {
          return res.end(JSON.stringify({
            success: false,
            error: err.message
          }));
        }

        const daysInMonth = new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          0
        ).getDate();

        for (let i = 1; i <= daysInMonth; i++) {
          const row = monthRows.find(r => r.day_no === i);

          data.month.push({
            name: `Day ${i}`,
            value: row ? row.total : 0
          });
        }

        db.query(yearSql, (err, yearRows) => {
          if (err) {
            return res.end(JSON.stringify({
              success: false,
              error: err.message
            }));
          }

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
            "Dec"
          ];

          for (let i = 1; i <= 12; i++) {
            const row = yearRows.find(r => r.month_no === i);

            data.year.push({
              name: monthNames[i - 1],
              value: row ? row.total : 0
            });
          }

          res.end(JSON.stringify({
            success: true,
            data
          }));
        });
      });
    });
  });
}

function systemShopMenuBranches(req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });

  const sql = `
    SELECT
      s.id AS shop_id,
      s.shop_name,
      m.id AS menu_id,
      m.name AS menu_name,
      m.prices
    FROM shops s
    LEFT JOIN menu m ON s.id = m.shop_id
    WHERE s.permission = 'approved'
    ORDER BY s.shop_name, m.name
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }

    const shopsMap = {};

    rows.forEach(row => {
      if (!shopsMap[row.shop_id]) {
        shopsMap[row.shop_id] = {
          id: row.shop_id,
          shop_name: row.shop_name,
          menus: []
        };
      }

      if (row.menu_id) {
        let price = 0;

        try {
          const prices =
            typeof row.prices === "string"
              ? JSON.parse(row.prices)
              : row.prices;

          if (Array.isArray(prices) && prices.length > 0) {
            price = Number(prices[0].price || 0);
          }
        } catch (e) {}

        shopsMap[row.shop_id].menus.push({
          menu_id: row.menu_id,
          menu_name: row.menu_name,
          price
        });
      }
    });

    const data = Object.values(shopsMap);

    res.end(JSON.stringify({
      success: true,
      data
    }));
  });
}

const top5DeliverymenBySystem = async (req, res) => {
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
      WHERE d.work_type IS NULL
      ORDER BY total_order DESC
      LIMIT 5
    `;

    db.query(
      query,
      [
        startOfMonth,
        endOfMonth,
        startOfMonth,
        endOfMonth
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

function systemTop5Customers(req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });

  const sql = `
    SELECT
      u.id AS user_id,
      u.name,
      o.shopId,
      s.shop_name
    FROM users u
    LEFT JOIN orders o ON u.id = o.userId
    LEFT JOIN shops s ON o.shopId = s.id
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }

    const customers = {};

    rows.forEach(row => {
      if (!customers[row.user_id]) {
        customers[row.user_id] = {
          name: row.name,
          total_orders: 0,
          shopCounts: {}
        };
      }

      if (row.shopId) {
        customers[row.user_id].total_orders++;

        const shopName = row.shop_name || "Unknown Shop";

        if (!customers[row.user_id].shopCounts[shopName]) {
          customers[row.user_id].shopCounts[shopName] = 0;
        }

        customers[row.user_id].shopCounts[shopName]++;
      }
    });

    const result = Object.values(customers)
      .filter(customer => customer.total_orders > 0)
      .map(customer => {
        let mostOrderShop = "";
        let maxCount = 0;

        Object.entries(customer.shopCounts).forEach(([shop, count]) => {
          if (count > maxCount) {
            maxCount = count;
            mostOrderShop = shop;
          }
        });

        return {
          name: customer.name,
          total_orders: customer.total_orders,
          most_order_shop: mostOrderShop
        };
      })
      .sort((a, b) => b.total_orders - a.total_orders)
      .slice(0, 5);

    res.end(JSON.stringify({
      success: true,
      customers: result
    }));
  });
}

function top5ShopsThisMonth(req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });

  const sql = `
    SELECT
      s.id,
      s.shop_name,
      COUNT(o.id) AS total_orders,
      COUNT(DISTINCT o.userId) AS total_customer
    FROM shops s
    LEFT JOIN orders o
      ON s.id = o.shopId
      AND YEAR(o.created_at) = YEAR(CURDATE())
      AND MONTH(o.created_at) = MONTH(CURDATE())
    GROUP BY s.id, s.shop_name
    ORDER BY total_orders DESC
    LIMIT 5
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }

    res.end(JSON.stringify({
      success: true,
      data: rows.map(row => ({
        id: row.id,
        shop_name: row.shop_name,
        total_orders: Number(row.total_orders),
        total_customer: Number(row.total_customer)
      }))
    }));
  });
}

function top5LessShopThisMonth(req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });

  const sql = `
    SELECT
      s.id,
      s.shop_name,
      COUNT(o.id) AS total_orders,
      COUNT(DISTINCT o.userId) AS total_customer
    FROM shops s
    LEFT JOIN orders o
      ON s.id = o.shopId
      AND YEAR(o.created_at) = YEAR(CURDATE())
      AND MONTH(o.created_at) = MONTH(CURDATE())
    GROUP BY s.id, s.shop_name
    ORDER BY total_orders ASC, total_customer ASC
    LIMIT 5
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }

    res.end(JSON.stringify({
      success: true,
      data: rows.map(row => ({
        id: row.id,
        shop_name: row.shop_name,
        total_orders: Number(row.total_orders),
        total_customer: Number(row.total_customer)
      }))
    }));
  });
}

function top5MenuThisMonth(req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });

  const sql = `
    SELECT
      o.userId,
      o.orders,
      m.id AS menu_id,
      m.name AS menu_name,
      s.shop_name
    FROM orders o
    LEFT JOIN menu m ON 1=1
    LEFT JOIN shops s ON m.shop_id = s.id
    WHERE YEAR(o.created_at) = YEAR(CURDATE())
      AND MONTH(o.created_at) = MONTH(CURDATE())
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }

    db.query(`
      SELECT
        m.id,
        m.name AS menu_name,
        s.shop_name
      FROM menu m
      LEFT JOIN shops s ON m.shop_id = s.id
    `, (err2, menus) => {

      if (err2) {
        return res.end(JSON.stringify({
          success: false,
          error: err2.message
        }));
      }

      const menuMap = {};

      menus.forEach(menu => {
        menuMap[menu.id] = {
          id: menu.id,
          menu_name: menu.menu_name,
          shop_name: menu.shop_name,
          total_orders: 0,
          customers: new Set()
        };
      });

      rows.forEach(row => {
        const orderItems = Array.isArray(row.orders)
          ? row.orders
          : JSON.parse(row.orders);

        orderItems.forEach(item => {
          if (!menuMap[item.menu_id]) return;

          menuMap[item.menu_id].total_orders += Number(item.quantity || 1);

          if (row.userId) {
            menuMap[item.menu_id].customers.add(row.userId);
          }
        });
      });

      const data = Object.values(menuMap)
        .filter(item => item.total_orders > 0)
        .map(item => ({
          id: item.id,
          shop_name: item.shop_name,
          menu_name: item.menu_name,
          total_orders: item.total_orders,
          total_customer: item.customers.size
        }))
        .sort((a, b) => b.total_orders - a.total_orders)
        .slice(0, 5);

      res.end(JSON.stringify({
        success: true,
        data
      }));
    });
  });
}

function top5LessMenuThisMonth(req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });

  const sql = `
    SELECT
      o.userId,
      o.orders
    FROM orders o
    WHERE YEAR(o.created_at) = YEAR(CURDATE())
      AND MONTH(o.created_at) = MONTH(CURDATE())
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }

    db.query(`
      SELECT
        m.id,
        m.name AS menu_name,
        s.shop_name
      FROM menu m
      LEFT JOIN shops s ON m.shop_id = s.id
    `, (err2, menus) => {

      if (err2) {
        return res.end(JSON.stringify({
          success: false,
          error: err2.message
        }));
      }

      const menuMap = {};

      menus.forEach(menu => {
        menuMap[menu.id] = {
          id: menu.id,
          menu_name: menu.menu_name,
          shop_name: menu.shop_name,
          total_orders: 0,
          customers: new Set()
        };
      });

      rows.forEach(row => {
        const orderItems = Array.isArray(row.orders)
          ? row.orders
          : JSON.parse(row.orders);

        orderItems.forEach(item => {
          if (!menuMap[item.menu_id]) return;

          menuMap[item.menu_id].total_orders += Number(item.quantity || 1);

          if (row.userId) {
            menuMap[item.menu_id].customers.add(row.userId);
          }
        });
      });

      const data = Object.values(menuMap)
        .filter(item => item.total_orders > 0)
        .map(item => ({
          id: item.id,
          shop_name: item.shop_name,
          menu_name: item.menu_name,
          total_orders: item.total_orders,
          total_customer: item.customers.size
        }))
        .sort((a, b) => {
          if (a.total_orders !== b.total_orders) {
            return a.total_orders - b.total_orders;
          }
          return a.total_customer - b.total_customer;
        })
        .slice(0, 5);

      res.end(JSON.stringify({
        success: true,
        data
      }));
    });
  });
}

function shopsSummariesSystem(req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });

  const sql = `
    SELECT
      (SELECT COUNT(*) FROM shops) AS total_shops,

      (SELECT COUNT(*) FROM menu) AS total_menu,

      (
        SELECT COUNT(*)
        FROM shops
        WHERE DATE(created_at) = CURDATE()
      ) AS today_shops,

      (
        SELECT COUNT(*)
        FROM deliverymen
        WHERE work_type IS NOT NULL
          AND work_type != ''
      ) AS total_shop_deliverymen
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }

    const summary = rows[0];

    res.end(JSON.stringify({
      success: true,
      data: {
        total_shops: Number(summary.total_shops),
        total_menu: Number(summary.total_menu),
        today_shops: Number(summary.today_shops),
        total_shop_deliverymen: Number(summary.total_shop_deliverymen)
      }
    }));
  });
}

function systemReportSummaries(req, res) {
  res.writeHead(200, {
    "Content-Type": "application/json"
  });

  const sql = `
    SELECT
      COUNT(*) AS today_orders,
      COALESCE(SUM(grand_total), 0) AS today_amount,
      COALESCE(SUM(delivery_fees), 0) AS today_delivery_fees,
      COUNT(DISTINCT userId) AS total_customers
    FROM orders
    WHERE DATE(created_at) = CURDATE()
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }

    const report = rows[0];

    res.end(JSON.stringify({
      success: true,
      data: {
        today_orders: Number(report.today_orders),
        today_amount: Number(report.today_amount),
        today_delivery_fees: Number(report.today_delivery_fees),
        total_customers: Number(report.total_customers)
      }
    }));
  });
}

module.exports = { 
    getDashboardSummariesByShop,
    getReportRvenueByShopId,
    getReportCategoriesChartByShopId,
    top5MenuByShopId,
    dashboardOrdersValuesChartByShopId,
    top5DeliverymenByShopId,
    top5LessMenuByShopId,
    top5CustomerByShopId,
    ordersSummaries,
    deliverymenSummaries,
    paymentsChartByShop,
    systemDashboardSummaries,
    systemOrderChart,
    systemShopMenuBranches,
    top5DeliverymenBySystem,
    systemTop5Customers,
    top5ShopsThisMonth,
    top5LessShopThisMonth,
    top5MenuThisMonth,
    top5LessMenuThisMonth,
    shopsSummariesSystem,
    systemReportSummaries
};