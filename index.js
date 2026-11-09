// const express = require("express");
// require("dotenv").config();
// const http = require("http");
// const { WebSocketServer } = require("ws");
// const admin = require("./firebaseAdmin");

// const app = express();
// app.use(express.json());

// const server = http.createServer(app);
// const wss = new WebSocketServer({ noServer: true });

// const clients = new Map(); // userId -> Set of sockets

// server.on("upgrade", async (req, socket, head) => {
//   try {
//     const token = new URL(req.url, "http://localhost").searchParams.get(
//       "token",
//     );

//     if (!token) {
//       throw new Error("Missing Firebase token");
//     }
//     console.log("✅ Firebase token received");

//     // Don't log the actual token
//     console.log("Token length:", token.length);

//     const decodedToken = await admin.auth().verifyIdToken(token);
//     console.log("✅ Firebase token verified");

//     const userId = decodedToken.uid;
//     console.log("Authenticated Firebase user:", userId);

//     wss.handleUpgrade(req, socket, head, (ws) => {
//       console.log("✅ HTTP connection upgraded to WebSocket");
//       ws.userId = userId;
//       wss.emit("connection", ws);
//     });
//   } catch (error) {
//     socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
//     socket.destroy();
//   }
// });

// wss.on("connection", (ws) => {
//   console.log("\n========== WebSocket Connected ==========");

//   console.log("User ID:", ws.userId);

//   console.log("WebSocket readyState:", ws.readyState);
//   if (!clients.has(ws.userId)) clients.set(ws.userId, new Set());
//   console.log("Created new socket set for user:", ws.userId);
//   clients.get(ws.userId).add(ws);

//   console.log("✅ Client registered successfully");

//   console.log("Active connections for this user:", clients.get(ws.userId).size);

//   console.log("Total connected users:", clients.size);

//   ws.on("close", () => {
//     clients.get(ws.userId)?.delete(ws);
//     if (clients.get(ws.userId)?.size === 0) clients.delete(ws.userId);
//   });
// });

// app.get("/health", (req, res) => {
//   res.status(200).json({
//     status: "ok",
//     service: "websocket-server",
//     connectedUsers: clients.size,
//   });
// });

// app.post("/notify", (req, res) => {
//   console.log("🔥 /notify request received");

//   try {
//     const { userId, notification } = req.body;

//     console.log("User ID:", userId);
//     console.log("Notification:", notification);

//     if (req.headers["x-internal-secret"] !== process.env.INTERNAL_SECRET) {
//       return res.status(401).json({ error: "Unauthorized" });
//     }

//     const userSockets = clients.get(userId);
//     let delivered = false;
//     console.log("Connected sockets:", userSockets?.size ?? 0);

//     userSockets?.forEach((ws) => {
//       console.log("Socket state:", ws.readyState);

//       if (ws.readyState === 1) {
//         ws.send(JSON.stringify(notification));
//         delivered = true;
//         console.log("✅ Notification sent");
//       }
//     });

//     console.log("Sending HTTP 200 response");

//     // return res.sendStatus(200);
//     return res.json({ delivered });
//   } catch (error) {
//     console.error("❌ /notify error:", error);

//     return res.status(500).json({
//       message: "Notification failed",
//     });
//   }
// });

// const PORT = process.env.PORT || 8080;

// server.listen(PORT, "0.0.0.0", () => {
//   console.log(`WebSocket server running on port ${PORT}`);
// });



const express = require("express");
require("dotenv").config();

const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const admin = require("./firebaseAdmin");

const app = express();
app.use(express.json({ limit: "100kb" }));

const server = http.createServer(app);

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 1024 * 1024,
});

const clients = new Map();

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "websocket-server",
    connectedUsers: clients.size,
  });
});

// WebSocket authentication and upgrade
server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname !== "/") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const token = url.searchParams.get("token");

    if (!token) {
      throw new Error("Missing Firebase token");
    }

    const decodedToken = await admin
      .auth()
      .verifyIdToken(token);

    if (socket.destroyed) return;

    const userId = decodedToken.uid;

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      wss.emit("connection", ws);
    });
  } catch (error) {
    console.error("WebSocket authentication failed:", error.message);

    if (!socket.destroyed) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    }
  }
});

// Register connected users
wss.on("connection", (ws) => {
  console.log("WebSocket connected:", ws.userId);

  if (!clients.has(ws.userId)) {
    clients.set(ws.userId, new Set());
  }

  clients.get(ws.userId).add(ws);

  ws.on("close", () => {
    const userSockets = clients.get(ws.userId);

    userSockets?.delete(ws);

    if (userSockets?.size === 0) {
      clients.delete(ws.userId);
    }

    console.log("WebSocket disconnected:", ws.userId);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});

// Internal notification endpoint
app.post("/notify", (req, res) => {
  if (!process.env.INTERNAL_SECRET) {
    return res.status(500).json({
      error: "Internal secret is not configured",
    });
  }

  if (
    req.headers["x-internal-secret"] !==
    process.env.INTERNAL_SECRET
  ) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  const { userId, notification } = req.body;

  if (!userId || !notification) {
    return res.status(400).json({
      error: "userId and notification are required",
    });
  }

  try {
    const userSockets = clients.get(String(userId));

    let delivered = false;

    userSockets?.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(notification));
        delivered = true;
      }
    });

    return res.status(200).json({ delivered });
  } catch (error) {
    console.error("Notification delivery error:", error);

    return res.status(500).json({
      error: "Notification delivery failed",
    });
  }
});

// Start server
const PORT = process.env.PORT || 8080;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
