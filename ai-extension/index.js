import crypto from "crypto";
import { orchestrateChat } from "./chatbot/orchestrator.js";

export async function startAIDesignFlow({ message, mode, image }) {
  console.log("🚀 startAIDesignFlow CALLED");

  if (!message) {
    throw new Error("Message is required");
  }

  // 🔑 TEMP SESSION (later per user)
  const sessionId = crypto.randomUUID();

  const result = await orchestrateChat({
    sessionId,
    message,
  });

  // 🔒 FRONTEND RESPONSE CONTRACT
  return {
    image: result.image,
    data: {
      style: result.data.style,
      room: {
        type: result.data.room?.type || result.data.room,
      },
      tips: result.data.tips,
    },
  };
}
