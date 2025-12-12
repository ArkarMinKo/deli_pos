const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const db = require("./db");

// Routes
const accounts = require("./POS_routes/accounts");
const products = require("./POS_routes/products")
const shops = require("./POS_routes/shops");
const orders = require("./POS_routes/orders");

// CORS helper
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Upload folders
const SHOP_UPLOAD_DIR = path.join(__dirname, "shop_pos_uploads");
const ACCOUNT_UPLOAD_DIR = path.join(__dirname, "account_uploads");

// Create upload folders
fs.mkdirSync(SHOP_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ACCOUNT_UPLOAD_DIR, { recursive: true });

/* ------------------------------------
      UNIVERSAL STATIC SERVE FUNCTION
--------------------------------------*/
function serveStaticFolder(reqPath, res, urlPrefix, folderPath) {
  if (!reqPath.startsWith(urlPrefix)) return false;

  const fileName = reqPath.replace(urlPrefix, "");
  const safePath = path.join(folderPath, fileName);

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("File not found");
    }

    const ext = path.extname(safePath).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
    };

    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
    });
    res.end(data);
  });

  return true;
}

const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        setCorsHeaders(res);
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathName = parsedUrl.pathname;
    const method = req.method;

    // CALL IMAGE
    if (serveStaticFolder(pathName, res, "/shop-pos-uploads/", SHOP_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/account-uploads/", ACCOUNT_UPLOAD_DIR)) return;

    // Accounts CRUD
    if (pathName === "/login-accounts" && method === "POST") accounts.loginAccount(req, res);
    else if (pathName === "/accounts" && method === "POST") accounts.createAccounts(req, res);
    else if (pathName === "/accounts" && method === "GET") accounts.getAllAccounts(req, res);
    else if (pathName.startsWith("/accounts/") && method === "PUT") {
        const id = pathName.split("/")[2];
        accounts.putAccount(req, res, id);
    }

    else if (pathName.startsWith("/accounts/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        accounts.deleteAccount(req, res, id);
    }

    else if (pathName.startsWith("/accounts/") && method === "GET") {
        const id = pathName.split("/")[2];
        accounts.getAccountsById(req, res, id);
    }

    // Products CRUD
    else if (pathName === "/products" && method === "POST") products.createProducts(req, res);
    else if (pathName === "/products" && method === "GET") products.getAllProducts(req, res);

    else if (pathName.startsWith("/products/") && method === "GET") {
        const id = pathName.split("/")[2];
        products.getProductsById(req, res, id);
    }

    else if (pathName.startsWith("/products/") && method === "PUT") {
        const id = pathName.split("/")[2];
        products.putProducts(req, res, id);
    }

    else if (pathName.startsWith("/products/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        products.deleteProducts(req, res, id);
    }

    // Shops CRUD
    else if (pathName === "/shops" && method === "POST") shops.createShops(req, res);
    else if (pathName === "/shops" && method === "GET") shops.getAllShops(req, res);

    else if (pathName.startsWith("/shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        shops.getShopsById(req, res, id);
    }
    
    else if (pathName.startsWith("/shops/") && method === "PUT") {
        const id = pathName.split("/")[2];
        shops.putShops(req, res, id);
    }

    else if (pathName.startsWith("/shops/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        shops.deleteShops(req, res, id);
    }

    // Orders CRUD
    else if (pathName === "/orders" && method === "POST") orders.createOrder(req, res);
    else if (pathName === "/orders" && method === "GET") orders.getAllOrders(req, res);

    else if (pathName.startsWith("/orders/") && method === "GET") {
        const id = pathName.split("/")[2];
        orders.getOrderBySellerId(req, res, id);
    }

    // --- 404 fallback ---
    else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Route not found" }));
    }
})

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});