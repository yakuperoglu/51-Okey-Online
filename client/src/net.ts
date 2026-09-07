import { io, type Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "@okey/engine";

let shared: Socket | null = null;

export function connect(): Socket {
  if (shared) return shared;
  const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
  const url = envUrl || (import.meta.env.DEV ? "http://localhost:3001" : window.location.origin);
  shared = io(url, {
    transports: ["websocket", "polling"],
    forceNew: true,
  });
  return shared;
}

export function send(socket: Socket, payload: ClientToServer) {
  socket.emit("msg", payload);
}

export type { ServerToClient };
