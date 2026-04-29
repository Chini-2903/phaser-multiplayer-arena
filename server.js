const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const rooms = {}; 
const playerMappings = {}; 

function generateRoomCode() {
    let result = '';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    for (let i = 0; i < 3; i++) result += letters.charAt(Math.floor(Math.random() * letters.length));
    for (let i = 0; i < 3; i++) result += numbers.charAt(Math.floor(Math.random() * numbers.length));
    if (rooms[result]) return generateRoomCode();
    return result;
}

function endMatch(code, room) {
    room.state = 'LOBBY'; 
    let playersArray = Object.values(room.players).filter(p => p.inGame);
    playersArray.sort((a, b) => b.score - a.score);
    io.to(code).emit('matchEnded', playersArray);
}

setInterval(() => {
    let now = Date.now();
    for (const code in rooms) {
        let room = rooms[code];
        if (room.state === 'INGAME') {
            let stateChanged = false;
            
            Object.values(room.players).forEach(p => {
                if (p.hp > 0 && p.hp < p.maxHp && p.inGame) {
                    if (now - p.lastHitTime > 6000) { 
                        if (now - p.lastHealTick > 1000) { 
                            p.hp = Math.min(p.maxHp, p.hp + 5);
                            p.lastHealTick = now;
                            stateChanged = true;
                        }
                    }
                }
                
                if (p.invincible && now >= p.spawnTime && now - p.spawnTime > 4000) {
                    p.invincible = false;
                    stateChanged = true;
                }
            });

            if(stateChanged) io.to(code).emit('gameStateUpdate', room.players);

            if (now >= room.matchStartTime && now - room.lastTimerTick > 1000) {
                room.timer -= 1;
                room.lastTimerTick = now;
                
                let mins = Math.floor(room.timer / 60).toString().padStart(2, '0');
                let secs = (room.timer % 60).toString().padStart(2, '0');
                io.to(code).emit('timerUpdate', `${mins}:${secs}`);

                if (room.timer <= 0) {
                    endMatch(code, room);
                }
            }
        }
    }
}, 100);

io.on('connection', (socket) => {
    
    socket.on('createRoom', (playerName) => {
        const code = generateRoomCode();
        rooms[code] = { players: {}, state: 'LOBBY', timer: 300, lastTimerTick: 0, matchStartTime: 0 };
        rooms[code].players[socket.id] = { id: socket.id, name: playerName, ready: false, isHost: true, inGame: false, colorIndex: 0 };
        playerMappings[socket.id] = code;
        
        socket.join(code);
        socket.emit('roomCreated', code);
        io.to(code).emit('lobbyUpdate', rooms[code].players);
    });

    socket.on('joinRoom', (data) => {
        const code = data.code;
        if (!rooms[code]) return socket.emit('joinError', 'Room not found!');
        if (rooms[code].state === 'INGAME' || rooms[code].state === 'ENDED') return socket.emit('joinError', 'Game already in progress!');
        if (Object.keys(rooms[code].players).length >= 8) return socket.emit('joinError', 'Room is full!');

        let cIdx = Object.keys(rooms[code].players).length;
        rooms[code].players[socket.id] = { id: socket.id, name: data.name, ready: false, isHost: false, inGame: false, colorIndex: cIdx };
        playerMappings[socket.id] = code;
        
        socket.join(code);
        socket.emit('roomJoined', code);
        io.to(code).emit('lobbyUpdate', rooms[code].players);
    });

    socket.on('leaveRoom', () => {
        let code = playerMappings[socket.id];
        if (code && rooms[code]) {
            let wasHost = rooms[code].players[socket.id].isHost;
            delete rooms[code].players[socket.id];
            delete playerMappings[socket.id];
            
            socket.leave(code);
            
            if(Object.keys(rooms[code].players).length === 0) {
                delete rooms[code];
            } else {
                if(wasHost) {
                    let nextPlayer = Object.values(rooms[code].players)[0];
                    if(nextPlayer) nextPlayer.isHost = true;
                }
                io.to(code).emit('lobbyUpdate', rooms[code].players);
            }
        }
    });

    socket.on('requestLobbyData', () => {
        let code = playerMappings[socket.id];
        if (code && rooms[code]) {
            io.to(socket.id).emit('lobbyUpdate', rooms[code].players);
        }
    });

    socket.on('toggleReady', (isReady) => {
        let code = playerMappings[socket.id];
        if (code && rooms[code]) {
            rooms[code].players[socket.id].ready = isReady;
            io.to(code).emit('lobbyUpdate', rooms[code].players);
        }
    });

    socket.on('startGame', () => {
        let code = playerMappings[socket.id];
        if (code && rooms[code] && rooms[code].players[socket.id].isHost) {
            rooms[code].state = 'INGAME';
            rooms[code].timer = 300; 
            rooms[code].matchStartTime = Date.now() + 5000; 
            rooms[code].lastTimerTick = Date.now() + 5000;
            
            Object.values(rooms[code].players).forEach(p => {
                p.inGame = true;
                p.score = 0;
                p.deaths = 0;
                p.hp = 100;
                p.maxHp = 100;
                p.x = Math.floor(Math.random() * 1500) + 250;
                p.y = Math.floor(Math.random() * 1500) + 250;
                p.invincible = true;
                p.spawnTime = rooms[code].matchStartTime; 
                p.lastHitTime = 0;
                p.lastHealTick = 0;
            });

            io.to(code).emit('gameStarting');
        }
    });

    socket.on('playerReadyForMatch', () => {
        let code = playerMappings[socket.id];
        if (code && rooms[code]) {
            socket.emit('timerUpdate', '05:00');
            socket.emit('matchInit', rooms[code]);
            socket.emit('gameStateUpdate', rooms[code].players);
        }
    });

    socket.on('playerMovement', (movementData) => {
        let code = playerMappings[socket.id];
        if (code && rooms[code]) {
            rooms[code].players[socket.id].x = movementData.x;
            rooms[code].players[socket.id].y = movementData.y;
            socket.to(code).emit('playerMoved', rooms[code].players[socket.id]);
        }
    });

    socket.on('shoot', (bulletData) => {
        let code = playerMappings[socket.id];
        if (code) socket.to(code).emit('playerShot', bulletData);
    });

    socket.on('playerTagged', (taggedId) => {
        let code = playerMappings[socket.id];
        if (!code || !rooms[code]) return;
        if (rooms[code].state !== 'INGAME') return;
        
        let shooter = rooms[code].players[socket.id];
        let target = rooms[code].players[taggedId];

        if (shooter && target && target.hp > 0 && !target.invincible) {
            target.hp -= 10; 
            target.lastHitTime = Date.now();
            shooter.score += 10; 
            
            io.to(code).emit('playerHit');
            io.to(code).emit('gameStateUpdate', rooms[code].players);

            if (target.hp <= 0) {
                target.deaths += 1;
                io.to(target.id).emit('youDied');
                io.to(code).emit('gameStateUpdate', rooms[code].players);
                
                const alivePlayers = Object.values(rooms[code].players).filter(p => p.hp > 0 && p.inGame);
                if (alivePlayers.length <= 1 && Object.keys(rooms[code].players).length > 1) {
                    endMatch(code, rooms[code]);
                }
            }
        }
    });

    socket.on('returnToLobby', () => {
        let code = playerMappings[socket.id];
        if (code && rooms[code]) {
            rooms[code].players[socket.id].inGame = false;
            rooms[code].players[socket.id].ready = false; 
            io.to(code).emit('lobbyUpdate', rooms[code].players);
        }
    });

    socket.on('disconnect', () => {
        let code = playerMappings[socket.id];
        if (code && rooms[code]) {
            let wasHost = rooms[code].players[socket.id].isHost;
            delete rooms[code].players[socket.id];
            
            if(Object.keys(rooms[code].players).length === 0) {
                delete rooms[code];
            } else {
                if(wasHost) {
                    let nextPlayer = Object.values(rooms[code].players)[0];
                    if(nextPlayer) nextPlayer.isHost = true;
                }
                io.to(code).emit('lobbyUpdate', rooms[code].players);
                io.to(code).emit('playerEliminated', socket.id);
            }
        }
        delete playerMappings[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));