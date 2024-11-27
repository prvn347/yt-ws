import { WebSocketServer, WebSocket } from "ws";

interface User {
  videoId: string;
  ws: WebSocket;
}

const subscriptions: { [videoId: string]: WebSocket[] } = {};

const broadcastToSubscribers = (videoId: string, message: any) => {
  const subscribers = subscriptions[videoId] || [];
  subscribers.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
};


const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws: WebSocket) => {
  console.log("New client connected");

  ws.on("message", (message: string) => {
    try {
      const data = JSON.parse(message);
      const { type } = data;

      switch (type) {
        case "video:subscribe": {
          const { video_id } = data;
          if (!subscriptions[video_id]) {
            subscriptions[video_id] = [];
          }
          subscriptions[video_id].push(ws);
          console.log(`Client subscribed to video ${video_id}`);
          break;
        }

        case "video:unsubscribe": {
          const { video_id } = data;
          subscriptions[video_id] = (subscriptions[video_id] || []).filter(
            (client) => client !== ws
          );
          console.log(`Client unsubscribed from video ${video_id}`);
          break;
        }

        default:
          console.warn(`Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error("Failed to process message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  
    Object.keys(subscriptions).forEach((videoId) => {
      subscriptions[videoId] = subscriptions[videoId].filter(
        (client) => client !== ws
      );
    });
  });
});


setInterval(() => {
  const videoId = "example_video_uuid"; 
  const message = {
    type: "video:timestamp_updated",
    timestamp: Math.random() * 100,
    user_id: "example_user_uuid",
  };
  broadcastToSubscribers(videoId, message);
}, 5000);

console.log("WebSocket server is running on ws://localhost:8080");
