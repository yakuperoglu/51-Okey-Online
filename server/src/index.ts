import {
  applyAction,
  createMatch,
  pickBotAction,
  serializeFor,
  type ClientToServer,
  type GameState,
  type Pairing,
  type PublicRoom,
  type RoomVisibility,
  type RoomView,
  type Ruleset,
} from "@okey/engine";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

interface Seat {
  id: string;
  name: string;
  avatarId?: string;
  isBot: boolean;
  connected: boolean;
  socketId?: string;
}

interface Room {
  code: string;
  hostId: string;
  seats: Seat[];
  minPairs: number;
  visibility: RoomVisibility;
  ruleset: Ruleset;
  pairing: Pairing;
  matchmade: boolean;
  game: GameState | null;
  botTimer?: ReturnType<typeof setTimeout>;
}

interface QueueEntry {
  socketId: string;
  name: string;
  avatarId?: string;
}

const rooms = new Map<string, Room>();
const queues = new Map<string, QueueEntry[]>();
const BOT_NAMES = ["Leyla", "Cem", "Deniz", "Pelin", "Tarık", "Aslı"];
const BOT_AVATARS = ["owl", "wolf", "frog", "tiger", "penguin", "dragon"];

function code(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function hostName(room: Room): string {
  return room.seats.find((s) => s.id === room.hostId)?.name ?? "Oyuncu";
}

function hostAvatar(room: Room): string | undefined {
  return room.seats.find((s) => s.id === room.hostId)?.avatarId;
}

function view(room: Room): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    hostName: hostName(room),
    started: Boolean(room.game),
    minPairs: room.minPairs,
    visibility: room.visibility,
    ruleset: room.ruleset,
    pairing: room.pairing,
    seats: room.seats.map((s) => ({
      id: s.id,
      name: s.name,
      avatarId: s.avatarId,
      isBot: s.isBot,
      connected: s.connected,
      ready: true,
    })),
  };
}

function publicList(): PublicRoom[] {
  return [...rooms.values()]
    .filter((r) => r.visibility === "public" && !r.game)
    .map((r) => ({
      code: r.code,
      hostName: hostName(r),
      hostAvatarId: hostAvatar(r),
      seats: r.seats.length,
      started: false,
      minPairs: r.minPairs,
      ruleset: r.ruleset,
      pairing: r.pairing,
    }));
}

function emitRooms(io: Server) {
  io.to("lobby").emit("msg", { type: "rooms", rooms: publicList() });
}

function emitRoom(io: Server, room: Room) {
  io.to(room.code).emit("msg", { type: "room", room: view(room) });
  if (room.game) {
    for (const seat of room.seats) {
      if (!seat.socketId || seat.isBot) continue;
      io.to(seat.socketId).emit("msg", { type: "game", state: serializeFor(room.game, seat.id) });
    }
  }
  emitRooms(io);
}

function err(socket: { emit: (e: string, v: unknown) => void }, message: string) {
  socket.emit("msg", { type: "error", message });
}

function emitQueue(io: Server, key: string) {
  const waiting = queues.get(key)?.length ?? 0;
  for (const entry of queues.get(key) ?? []) {
    io.to(entry.socketId).emit("msg", { type: "queue", waiting, need: 4 });
  }
}

function queueKey(ruleset: Ruleset, pairing: Pairing, minPairs: number) {
  return `${ruleset}:${pairing}:${minPairs}`;
}

function leaveQueue(io: Server, socket: import("socket.io").Socket) {
  const key = socket.data.queueKey as string | undefined;
  if (!key) return;
  const list = queues.get(key);
  if (list) {
    queues.set(
      key,
      list.filter((e) => e.socketId !== socket.id),
    );
    if ((queues.get(key)?.length ?? 0) === 0) queues.delete(key);
  }
  socket.data.queueKey = undefined;
  emitQueue(io, key);
}

function seatSocket(
  io: Server,
  socket: import("socket.io").Socket,
  room: Room,
  name: string,
  avatarId: string | undefined,
) {
  const playerId = uid();
  room.seats.push({
    id: playerId,
    name: name.trim().slice(0, 16) || "Oyuncu",
    avatarId,
    isBot: false,
    connected: true,
    socketId: socket.id,
  });
  socket.leave("lobby");
  socket.join(room.code);
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;
  socket.data.queueKey = undefined;
  socket.emit("msg", { type: "joined", playerId, room: view(room) });
  return playerId;
}

function startRoom(io: Server, room: Room) {
  if (room.game || room.seats.length !== 4) return;
  room.game = createMatch(
    room.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot, avatarId: s.avatarId })),
    {
      minPairs: room.minPairs as 4 | 5,
      ruleset: room.ruleset,
      pairing: room.pairing,
      potContribution: room.ruleset === "kanli" ? 10 : 0,
    },
  );
  emitRoom(io, room);
  scheduleBots(io, room);
}

function findPublicSeat(ruleset: Ruleset, pairing: Pairing, minPairs: number): Room | undefined {
  return [...rooms.values()]
    .filter((r) => r.visibility === "public" && !r.game && r.seats.length < 4)
    .filter((r) => r.ruleset === ruleset && r.pairing === pairing && r.minPairs === minPairs)
    .sort((a, b) => b.seats.length - a.seats.length)[0];
}

function makeRoom(
  host: Seat & { id: string },
  ruleset: Ruleset,
  pairing: Pairing,
  minPairs: number,
  visibility: RoomVisibility,
  matchmade: boolean,
): Room {
  let roomCode = code();
  while (rooms.has(roomCode)) roomCode = code();
  const room: Room = {
    code: roomCode,
    hostId: host.id,
    minPairs,
    visibility,
    ruleset,
    pairing,
    matchmade,
    seats: [host],
    game: null,
  };
  rooms.set(roomCode, room);
  return room;
}

function scheduleBots(io: Server, room: Room) {
  if (room.botTimer) clearTimeout(room.botTimer);
  const tick = () => {
    if (!room.game || room.game.phase !== "playing") return;
    const current = room.game.players[room.game.currentIndex];
    const seat = room.seats.find((s) => s.id === current.id);
    if (!seat?.isBot) return;
    const action = pickBotAction(room.game);
    if (!action || action.type === "nextRound") return;
    const result = applyAction(room.game, current.id, action);
    if (!result.ok) return;
    room.game = result.state;
    emitRoom(io, room);
    room.botTimer = setTimeout(tick, 700);
  };
  room.botTimer = setTimeout(tick, 800);
}

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  socket.join("lobby");
  socket.emit("msg", { type: "rooms", rooms: publicList() });

  socket.on("msg", (payload: ClientToServer) => {
    try {
      handle(io, socket, payload);
    } catch (e) {
      err(socket, e instanceof Error ? e.message : "Sunucu hatası");
    }
  });

  socket.on("disconnect", () => {
    leaveQueue(io, socket);
    const roomCode = socket.data.roomCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!roomCode || !playerId) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    const seat = room.seats.find((s) => s.id === playerId);
    if (seat) {
      seat.connected = false;
      seat.socketId = undefined;
    }
    if (!room.game) {
      room.seats = room.seats.filter((s) => s.id !== playerId);
      if (room.seats.every((s) => s.isBot) || room.seats.length === 0) {
        rooms.delete(room.code);
        emitRooms(io);
        return;
      }
      if (room.hostId === playerId) room.hostId = room.seats.find((s) => !s.isBot)?.id ?? room.seats[0].id;
    }
    emitRoom(io, room);
  });
});

function handle(io: Server, socket: import("socket.io").Socket, payload: ClientToServer) {
  if (payload.type === "listRooms") {
    socket.emit("msg", { type: "rooms", rooms: publicList() });
    return;
  }

  if (payload.type === "leaveQueue") {
    leaveQueue(io, socket);
    socket.emit("msg", { type: "queue", waiting: 0, need: 4 });
    return;
  }

  if (payload.type === "quickPlay") {
    if (socket.data.roomCode) return err(socket, "Zaten bir odadasın.");
    leaveQueue(io, socket);
    const name = payload.name.trim().slice(0, 16) || "Oyuncu";
    const ruleset: Ruleset = payload.ruleset === "normal" ? "normal" : "kanli";
    const pairing: Pairing = payload.pairing === "ciftli" ? "ciftli" : "tekli";
    const minPairs = payload.minPairs === 5 ? 5 : 4;
    const open = findPublicSeat(ruleset, pairing, minPairs);
    if (open) {
      seatSocket(io, socket, open, name, payload.avatarId);
      emitRoom(io, open);
      if (open.matchmade && open.seats.length === 4) startRoom(io, open);
      return;
    }
    const key = queueKey(ruleset, pairing, minPairs);
    const list = queues.get(key) ?? [];
    list.push({ socketId: socket.id, name, avatarId: payload.avatarId });
    queues.set(key, list);
    socket.data.queueKey = key;
    if (list.length >= 4) {
      const taken = list.splice(0, 4);
      queues.set(key, list);
      const first = io.sockets.sockets.get(taken[0].socketId);
      if (!first) {
        emitQueue(io, key);
        return;
      }
      const hostId = uid();
      const room = makeRoom(
        {
          id: hostId,
          name: taken[0].name,
          avatarId: taken[0].avatarId,
          isBot: false,
          connected: true,
          socketId: first.id,
        },
        ruleset,
        pairing,
        minPairs,
        "public",
        true,
      );
      first.leave("lobby");
      first.join(room.code);
      first.data.roomCode = room.code;
      first.data.playerId = hostId;
      first.data.queueKey = undefined;
      first.emit("msg", { type: "joined", playerId: hostId, room: view(room) });
      for (const extra of taken.slice(1)) {
        const sock = io.sockets.sockets.get(extra.socketId);
        if (!sock) continue;
        seatSocket(io, sock, room, extra.name, extra.avatarId);
      }
      emitRoom(io, room);
      if (room.seats.length === 4) startRoom(io, room);
      emitQueue(io, key);
      return;
    }
    emitQueue(io, key);
    return;
  }

  if (payload.type === "createRoom") {
    leaveQueue(io, socket);
    const name = payload.name.trim().slice(0, 16) || "Oyuncu";
    let roomCode = code();
    while (rooms.has(roomCode)) roomCode = code();
    const playerId = uid();
    const ruleset: Ruleset = payload.ruleset === "normal" ? "normal" : "kanli";
    const pairing: Pairing = payload.pairing === "ciftli" ? "ciftli" : "tekli";
    const room: Room = {
      code: roomCode,
      hostId: playerId,
      minPairs: payload.minPairs === 5 ? 5 : 4,
      visibility: payload.visibility === "private" ? "private" : "public",
      ruleset,
      pairing,
      matchmade: false,
      seats: [{ id: playerId, name, avatarId: payload.avatarId, isBot: false, connected: true, socketId: socket.id }],
      game: null,
    };
    rooms.set(roomCode, room);
    socket.leave("lobby");
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.playerId = playerId;
    socket.emit("msg", { type: "joined", playerId, room: view(room) });
    emitRooms(io);
    return;
  }

  if (payload.type === "joinRoom") {
    leaveQueue(io, socket);
    const room = rooms.get(payload.code.trim().toUpperCase());
    if (!room) return err(socket, "Oda bulunamadı.");
    if (room.game) return err(socket, "Oyun başlamış, katılamazsın.");
    if (room.seats.length >= 4) return err(socket, "Oda dolu.");
    const playerId = uid();
    room.seats.push({
      id: playerId,
      name: payload.name.trim().slice(0, 16) || "Oyuncu",
      avatarId: payload.avatarId,
      isBot: false,
      connected: true,
      socketId: socket.id,
    });
    socket.leave("lobby");
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = playerId;
    socket.emit("msg", { type: "joined", playerId, room: view(room) });
    emitRoom(io, room);
    return;
  }

  const room = rooms.get(socket.data.roomCode);
  const playerId = socket.data.playerId as string | undefined;
  if (!room || !playerId) return err(socket, "Önce bir odaya gir.");

  if (payload.type === "leaveRoom") {
    socket.leave(room.code);
    socket.join("lobby");
    socket.data.roomCode = undefined;
    socket.data.playerId = undefined;
    if (room.game) {
      const seat = room.seats.find((s) => s.id === playerId);
      if (seat) {
        seat.connected = false;
        seat.socketId = undefined;
      }
      emitRoom(io, room);
    } else {
      room.seats = room.seats.filter((s) => s.id !== playerId);
      if (room.seats.length === 0) {
        rooms.delete(room.code);
      } else {
        if (room.hostId === playerId) {
          room.hostId = room.seats.find((s) => !s.isBot)?.id ?? room.seats[0].id;
        }
        emitRoom(io, room);
      }
    }
    emitRooms(io);
    socket.emit("msg", { type: "rooms", rooms: publicList() });
    return;
  }

  if (payload.type === "addBot" || payload.type === "fillBots") {
    if (room.hostId !== playerId) return err(socket, "Sadece oda sahibi bot ekleyebilir.");
    if (room.game) return err(socket, "Oyun başladı.");
    const need = payload.type === "fillBots" ? 4 - room.seats.length : Math.min(1, 4 - room.seats.length);
    for (let i = 0; i < need; i++) {
      if (room.seats.length >= 4) break;
      const used = new Set(room.seats.map((s) => s.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${i + 1}`;
      room.seats.push({
        id: `bot-${uid()}`,
        name,
        avatarId: BOT_AVATARS[room.seats.length % BOT_AVATARS.length],
        isBot: true,
        connected: true,
      });
    }
    emitRoom(io, room);
    return;
  }

  if (payload.type === "startGame") {
    if (room.hostId !== playerId) return err(socket, "Sadece oda sahibi başlatabilir.");
    if (room.seats.length !== 4) return err(socket, "Oyunu başlatmak için 4 oyuncu gerekir.");
    startRoom(io, room);
    return;
  }

  if (payload.type === "gameAction") {
    if (!room.game) return err(socket, "Oyun henüz başlamadı.");
    if (payload.action.type === "nextRound" && room.hostId !== playerId) {
      return err(socket, "Yeni eli oda sahibi başlatır.");
    }
    const result = applyAction(room.game, playerId, payload.action);
    if (!result.ok) return err(socket, result.error ?? "Geçersiz hamle.");
    room.game = result.state;
    emitRoom(io, room);
    scheduleBots(io, room);
  }
}

const port = Number(process.env.PORT) || 3001;
httpServer.listen(port, () => {
  console.log(`51 Okey sunucusu http://localhost:${port}`);
});
