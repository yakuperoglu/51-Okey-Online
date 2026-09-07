import { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type {
  ClientGameState,
  GameAction,
  Pairing,
  PublicRoom,
  RoomView,
  RoomVisibility,
  Ruleset,
  ServerToClient,
} from "@okey/engine";
import { connect, send } from "./net";
import { useSocial } from "./social/useSocial";
import { Lobby, Waiting } from "./ui/Lobby";
import { Table } from "./ui/Table";
import { ProfileSheet } from "./ui/Profile";
import { FriendsSheet } from "./ui/Friends";
import { HelpSheet, readSoundOn, SettingsSheet } from "./ui/Settings";
import { playCancel, playClick, playJoin, setSoundEnabled } from "./sound";

export default function App() {
  const socketRef = useRef<Socket | null>(null);
  const social = useSocial();
  const name = social.profile?.displayName || "Oyuncu";
  const avatarId = social.profile?.avatarId;
  const [panel, setPanel] = useState<null | "profile" | "friends" | "settings" | "help">(null);
  const [showRooms, setShowRooms] = useState(false);
  const [soundOn, setSoundOn] = useState(readSoundOn);
  const [code, setCode] = useState("");
  const [minPairs, setMinPairs] = useState<4 | 5>(4);
  const [ruleset, setRuleset] = useState<Ruleset>("normal");
  const [pairing, setPairing] = useState<Pairing>("tekli");
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [game, setGame] = useState<ClientGameState | null>(null);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [filterRuleset, setFilterRuleset] = useState<Ruleset | "all">("all");
  const [filterPairing, setFilterPairing] = useState<Pairing | "all">("all");
  const [filterPairs, setFilterPairs] = useState<4 | 5 | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSolo, setPendingSolo] = useState(false);
  const [searching, setSearching] = useState(false);
  const [queue, setQueue] = useState<{ waiting: number; need: number } | null>(null);

  useEffect(() => {
    const socket = connect();
    socketRef.current = socket;
    const onMsg = (msg: ServerToClient) => {
      if (msg.type === "error") {
        setError(msg.message);
        return;
      }
      setError(null);
      if (msg.type === "joined") {
        setPlayerId(msg.playerId);
        setRoom(msg.room);
        setSearching(false);
        setQueue(null);
      }
      if (msg.type === "room") setRoom(msg.room);
      if (msg.type === "game") setGame(msg.state);
      if (msg.type === "rooms") setRooms(msg.rooms);
      if (msg.type === "queue") {
        setSearching(msg.waiting > 0);
        setQueue({ waiting: msg.waiting, need: msg.need });
      }
    };
    const refreshRooms = () => send(socket, { type: "listRooms" });
    socket.on("msg", onMsg);
    socket.on("connect", refreshRooms);
    if (socket.connected) refreshRooms();
    return () => {
      socket.off("msg", onMsg);
      socket.off("connect", refreshRooms);
    };
  }, []);

  useEffect(() => {
    if (!pendingSolo || !room || !playerId) return;
    const socket = socketRef.current;
    if (!socket) return;
    if (room.seats.length < 4) send(socket, { type: "fillBots" });
    else if (!room.started) {
      send(socket, { type: "startGame" });
      setPendingSolo(false);
    } else setPendingSolo(false);
  }, [pendingSolo, room, playerId]);

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  const youAreHost = Boolean(room && playerId && room.hostId === playerId);

  const screen = useMemo(() => {
    if (game && room?.started) return "table";
    if (room) return "wait";
    return "lobby";
  }, [game, room]);

  function create(solo = false) {
    const socket = socketRef.current;
    if (!socket) return;
    playJoin();
    setPendingSolo(solo);
    send(socket, {
      type: "createRoom",
      name: name || "Oyuncu",
      avatarId,
      minPairs,
      visibility: solo ? "private" : visibility,
      ruleset,
      pairing,
    });
  }

  function join(roomCode: string) {
    const socket = socketRef.current;
    if (!socket) return;
    playClick();
    send(socket, { type: "joinRoom", code: roomCode, name: name || "Oyuncu", avatarId });
  }

  function quickPlay() {
    const socket = socketRef.current;
    if (!socket) return;
    playJoin();
    setSearching(true);
    setError(null);
    send(socket, {
      type: "quickPlay",
      name: name || "Oyuncu",
      avatarId,
      minPairs,
      ruleset,
      pairing,
    });
  }

  function cancelQueue() {
    const socket = socketRef.current;
    playCancel();
    if (socket) send(socket, { type: "leaveQueue" });
    setSearching(false);
    setQueue(null);
  }

  function leaveLobby() {
    const socket = socketRef.current;
    if (socket) {
      send(socket, { type: "leaveQueue" });
      send(socket, { type: "leaveRoom" });
    }
    setGame(null);
    setRoom(null);
    setPlayerId(null);
    setPendingSolo(false);
    setSearching(false);
    setQueue(null);
  }

  function act(action: GameAction) {
    const socket = socketRef.current;
    if (!socket) return;
    send(socket, { type: "gameAction", action });
  }

  useEffect(() => {
    document.body.classList.toggle("playing", screen === "table");
    const orient = window.screen.orientation as ScreenOrientation & {
      lock?: (mode: string) => Promise<void>;
    };
    if (screen === "table") {
      void orient?.lock?.("landscape").catch(() => undefined);
    } else {
      try {
        orient?.unlock?.();
      } catch {
        /* kilit yoksa devam */
      }
    }
    return () => document.body.classList.remove("playing");
  }, [screen]);

  return (
    <div className={`app ${screen === "table" ? "in-game" : ""}`}>
      {screen === "lobby" ? (
        <Lobby
          profile={social.profile}
          incomingCount={social.incoming.length}
          onlineHint={rooms.reduce((n, r) => n + r.seats, 0)}
          code={code}
          setCode={setCode}
          minPairs={minPairs}
          setMinPairs={setMinPairs}
          ruleset={ruleset}
          setRuleset={setRuleset}
          pairing={pairing}
          setPairing={setPairing}
          visibility={visibility}
          setVisibility={setVisibility}
          rooms={rooms}
          filterRuleset={filterRuleset}
          setFilterRuleset={setFilterRuleset}
          filterPairing={filterPairing}
          setFilterPairing={setFilterPairing}
          filterPairs={filterPairs}
          setFilterPairs={setFilterPairs}
          filterOpen={filterOpen}
          setFilterOpen={setFilterOpen}
          queue={queue}
          searching={searching}
          showRooms={showRooms}
          onShowRooms={setShowRooms}
          onCreate={() => create(false)}
          onSolo={() => create(true)}
          onJoin={() => join(code)}
          onJoinRoom={join}
          onQuick={quickPlay}
          onCancelQueue={cancelQueue}
          onRefresh={() => socketRef.current && send(socketRef.current, { type: "listRooms" })}
          onOpenProfile={() => setPanel("profile")}
          onOpenFriends={() => setPanel("friends")}
          onOpenSettings={() => setPanel("settings")}
          onOpenHelp={() => setPanel("help")}
          error={error ?? social.error}
        />
      ) : null}
      {screen === "wait" && room ? (
        <Waiting
          room={room}
          youAreHost={youAreHost}
          onAddBot={() => socketRef.current && send(socketRef.current, { type: "addBot" })}
          onFill={() => socketRef.current && send(socketRef.current, { type: "fillBots" })}
          onStart={() => socketRef.current && send(socketRef.current, { type: "startGame" })}
          onLeave={leaveLobby}
          error={error}
        />
      ) : null}
      {screen === "table" && game ? (
        <Table
          state={game}
          isHost={youAreHost}
          onAction={(action) => {
            playClick();
            act(action);
          }}
          flash={error}
          onLeave={leaveLobby}
        />
      ) : null}
      {screen === "lobby" && panel === "profile" && social.profile ? (
        <ProfileSheet
          profile={social.profile}
          cloud={social.cloud}
          onSave={social.saveProfile}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {screen === "lobby" && panel === "friends" && social.profile ? (
        <FriendsSheet
          profile={social.profile}
          cloud={social.cloud}
          friends={social.friends}
          incoming={social.incoming}
          onAdd={social.addFriend}
          onAccept={social.accept}
          onDecline={social.decline}
          onRemove={social.removeFriend}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {screen === "lobby" && panel === "settings" ? (
        <SettingsSheet
          soundOn={soundOn}
          setSoundOn={setSoundOn}
          onProfile={() => setPanel("profile")}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {screen === "lobby" && panel === "help" ? <HelpSheet onClose={() => setPanel(null)} /> : null}
    </div>
  );
}
