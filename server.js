const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const db = require("./db");

// Upload folders
const USER_UPLOAD_DIR = path.join(__dirname, "user_uploads");
const SHOP_UPLOAD_DIR = path.join(__dirname, "shop_uploads");

// Routes
const users = require("./routes/users");
const emails = require("./routes/emials");
const shops = require("./routes/shops");

// CORS helper
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathName = parsedUrl.pathname;
    const method = req.method;

    // --- Serve user uploads ---
    if (pathName.startsWith("/user-uploads/")) {
        const safePath = path.normalize(path.join(__dirname, pathName));
        if (!safePath.startsWith(USER_UPLOAD_DIR)) {
            res.writeHead(403);
            return res.end("Access denied");
        }
        fs.readFile(safePath, (err, data) => {
        if (err) return res.writeHead(404).end("File not found");
            const ext = path.extname(safePath).toLowerCase();
            const mimeTypes = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
        };
            res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
            res.end(data);
        });
        return;
    }

    if (pathName.startsWith("/shop-uploads/")) {
        const safePath = path.normalize(path.join(__dirname, pathName));
        if (!safePath.startsWith(SHOP_UPLOAD_DIR)) {
            res.writeHead(403);
            return res.end("Access denied");
        }
        fs.readFile(safePath, (err, data) => {
        if (err) return res.writeHead(404).end("File not found");
            const ext = path.extname(safePath).toLowerCase();
            const mimeTypes = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
        };
            res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
            res.end(data);
        });
        return;
    }

    // Users CRUD
    if (pathName === "/login-user" && method === "POST") users.loginUser(req, res);
    else if (pathName === "/users" && method === "POST") users.createUsers(req, res);
    else if (pathName === "/users" && method === "GET") users.getUsers(req, res);

    // -- email confrimation ---

    else if(pathName === "/request-email-confirmation" && method === "POST"){
        emails.requestEmailConfirmation(req, res);
    }

    else if(pathName === "/verify-email-code" && method === "POST"){
        emails.verifyEmailCodeBeforeCreate(req, res);
    }

    // Shops CRUD
    else if (pathName === "/login-shop" && method === "POST") {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => shops.loginShop(req, res, body));
        return;
    }
    else if (pathName === "/shops" && method === "POST") shops.createShops(req, res);
    else if (pathName === "/shops-pending" && method === "GET") shops.getShopsPending(req, res);

    // --- 404 fallback ---
    else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Route not found" }));
    }
})

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});