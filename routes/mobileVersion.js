const CURRENT_VERSION = "1.0.0+8";

function checkMobileVersion(clientVersion) {
    if (!clientVersion) {
        return {
            success: false,
            message: "Mobile version is required"
        };
    }

    const isUpdated = clientVersion === CURRENT_VERSION;

    return {
        success: isUpdated,
        currentVersion: CURRENT_VERSION,
        message: isUpdated
            ? "Mobile version is up to date"
            : "A new mobile version is available"
    };
}

function checkMobileVersionRoute(req, res) {
    let body = "";

    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", () => {
        try {
            const data = JSON.parse(body);

            const result = checkMobileVersion(data.version);

            res.writeHead(200, {
                "Content-Type": "application/json"
            });

            res.end(JSON.stringify(result));

        } catch (error) {
            res.writeHead(400, {
                "Content-Type": "application/json"
            });

            res.end(JSON.stringify({
                success: false,
                message: "Invalid request"
            }));
        }
    });
}

module.exports = {
    checkMobileVersionRoute
};