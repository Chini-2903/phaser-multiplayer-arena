import * as Phaser from 'phaser';
import { io } from 'socket.io-client';
// NEW: Force the mobile browser to stop stealing drag gestures
const style = document.createElement('style');
style.innerHTML = `body, html, canvas { touch-action: none !important; overflow: hidden; }`;
document.head.appendChild(style);

const GAME_COLORS = [0x0000ff, 0xff0000, 0x00ff00, 0x9900ff, 0xff9900, 0x00ffff, 0xff00ff, 0xffff00];

let globalSocket = io('https://phaser-multiplayer-arena.onrender.com', { 
    autoConnect: false,
    transports: ['websocket'] 
});

let myPlayerName = "Anonymous";

class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }

    create() {
        if (!globalSocket.connected) globalSocket.connect();
        
        const cx = this.cameras.main.centerX;
        const cy = this.cameras.main.centerY;

        this.statusText = this.add.text(cx, 30, '🟡 Waking up server...', { fontSize: '16px', fill: '#ffff00', fontStyle: 'bold' }).setOrigin(0.5);
        
        globalSocket.on('connect', () => {
            this.statusText.setText('🟢 Server Online!').setFill('#00ff00');
        });

        globalSocket.on('connect_error', (err) => {
            this.statusText.setText('🔴 Cannot reach server. Retrying...').setFill('#ff0000');
        });

        // Mobile responsive input box
        if (!document.getElementById('playerNameInput')) {
            const input = document.createElement('input');
            input.id = 'playerNameInput';
            input.type = 'text';
            input.placeholder = 'Enter Player Name...';
            input.style.position = 'absolute';
            input.style.top = '25%'; 
            input.style.left = '50%';
            input.style.transform = 'translate(-50%, -50%)';
            input.style.fontSize = '20px';
            input.style.padding = '10px';
            input.style.textAlign = 'center';
            input.style.zIndex = '1000';
            input.style.background = '#111';
            input.style.color = '#00ff00';
            input.style.border = '2px solid #00ff00';
            input.style.outline = 'none';
            input.style.width = '80%'; 
            input.style.maxWidth = '300px'; 
            document.body.appendChild(input);
        } else {
            document.getElementById('playerNameInput').style.display = 'block';
        }

        // Title and Instructions
        this.add.text(cx, cy - 100, 'MULTIPLAYER ARENA', { fontSize: '32px', fill: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(cx, cy - 50, '📱 Mobile: Left half moves | Right half shoots', { fontSize: '14px', fill: '#aaa' }).setOrigin(0.5);

        const hostBtn = this.add.rectangle(cx, cy + 30, 200, 50, 0x00ff00).setInteractive();
        this.add.text(cx, cy + 30, 'HOST GAME', { fontSize: '20px', fill: '#000', fontStyle: 'bold' }).setOrigin(0.5);
        
        hostBtn.on('pointerdown', () => {
            const nameInput = document.getElementById('playerNameInput');
            const enteredName = nameInput.value.trim();
            if(!enteredName) return alert("Name is required!");
            if (!globalSocket.connected) return alert("Still connecting! Please wait for the text to turn Green.");
            
            myPlayerName = enteredName;
            nameInput.style.display = 'none'; 
            globalSocket.emit('createRoom', myPlayerName);
        });

        const joinBtn = this.add.rectangle(cx, cy + 100, 200, 50, 0x00aaff).setInteractive();
        this.add.text(cx, cy + 100, 'JOIN GAME', { fontSize: '20px', fill: '#000', fontStyle: 'bold' }).setOrigin(0.5);

        joinBtn.on('pointerdown', () => {
            const nameInput = document.getElementById('playerNameInput');
            const enteredName = nameInput.value.trim();
            if(!enteredName) return alert("Name is required!");
            if (!globalSocket.connected) return alert("Still connecting! Please wait for the text to turn Green.");

            myPlayerName = enteredName;
            let code = prompt("Enter 6-character Party Code:");
            
            if (code && code.length === 6) {
                nameInput.style.display = 'none';
                globalSocket.emit('joinRoom', { code: code.toUpperCase(), name: myPlayerName });
            } else if (code) {
                alert("Invalid code format.");
            }
        });

        globalSocket.off('roomCreated');
        globalSocket.off('roomJoined');
        globalSocket.off('joinError');

        globalSocket.on('roomCreated', (roomCode) => {
            if(this.scene.isActive()) this.scene.start('LobbyScene', { roomCode: roomCode });
        });
        globalSocket.on('roomJoined', (roomCode) => {
            if(this.scene.isActive()) this.scene.start('LobbyScene', { roomCode: roomCode });
        });
        globalSocket.on('joinError', (msg) => {
            alert(msg);
            document.getElementById('playerNameInput').style.display = 'block';
        });
    }
}

class LobbyScene extends Phaser.Scene {
    constructor() { super('LobbyScene'); }

    init(data) {
        this.roomCode = data.roomCode;
        this.isReady = false;
        this.playersInLobby = {};
    }

    create() {
        const cx = this.cameras.main.centerX;
        
        const leaveBtn = this.add.text(20, 20, '⬅ LEAVE LOBBY', { fontSize: '18px', fill: '#fff', backgroundColor: '#aa0000', padding: {x: 10, y: 5} }).setInteractive();
        leaveBtn.on('pointerdown', () => {
            globalSocket.emit('leaveRoom');
            this.scene.start('MenuScene');
        });

        this.add.text(cx, 80, `PARTY: ${this.roomCode}`, { fontSize: '32px', fill: '#ffff00', fontStyle: 'bold' }).setOrigin(0.5);
        this.playerListText = this.add.text(cx, 130, 'Loading...', { fontSize: '20px', fill: '#fff', align: 'center' }).setOrigin(0.5, 0);

        const readyBtn = this.add.rectangle(cx, this.cameras.main.height - 150, 200, 50, 0x999999).setInteractive();
        this.readyBtnText = this.add.text(cx, this.cameras.main.height - 150, 'NOT READY', { fontSize: '20px', fill: '#000', fontStyle: 'bold' }).setOrigin(0.5);
        
        readyBtn.on('pointerdown', () => {
            this.isReady = !this.isReady;
            readyBtn.setFillStyle(this.isReady ? 0x00ff00 : 0x999999);
            this.readyBtnText.setText(this.isReady ? 'READY' : 'NOT READY');
            globalSocket.emit('toggleReady', this.isReady);
        });

        this.startBtn = this.add.rectangle(cx, this.cameras.main.height - 70, 250, 60, 0x555555).setInteractive().setVisible(false);
        this.startText = this.add.text(cx, this.cameras.main.height - 70, 'START GAME', { fontSize: '24px', fill: '#000', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false);
        
        this.startBtn.on('pointerdown', () => {
            let allReady = Object.values(this.playersInLobby).every(p => p.ready);
            let gameInProgress = Object.values(this.playersInLobby).some(p => p.inGame);
            if (gameInProgress) return alert("Wait for current match to end!");
            if (!allReady) return alert("All players must be ready!");
            globalSocket.emit('startGame');
        });

        globalSocket.off('lobbyUpdate');
        globalSocket.off('gameStarting');

        globalSocket.on('lobbyUpdate', (players) => {
            this.playersInLobby = players;
            let list = "";
            let allReady = true;
            let gameInProgress = false;
            let amIHost = false; 

            Object.values(players).forEach(p => {
                let status = p.inGame ? "(In-Game)" : (p.ready ? "🟢 READY" : "🔴 NOT READY");
                let hostTag = p.isHost ? " [HOST]" : "";
                list += `${p.name}${hostTag} ${status}\n`;
                if(!p.ready) allReady = false;
                if(p.inGame) gameInProgress = true;
                if (p.name === myPlayerName && p.isHost) amIHost = true;
            });
            this.playerListText.setText(list);

            if (amIHost) {
                this.startBtn.setVisible(true);
                this.startText.setVisible(true);
                if (allReady && !gameInProgress) this.startBtn.setFillStyle(0xffa500); 
                else this.startBtn.setFillStyle(0x555555);
            } else {
                this.startBtn.setVisible(false);
                this.startText.setVisible(false);
            }
        });

        globalSocket.on('gameStarting', () => {
            this.scene.start('GameScene', { roomCode: this.roomCode });
        });

        globalSocket.emit('requestLobbyData');
    }
}

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    init(data) { 
        this.roomCode = data.roomCode;
        this.myScore = 0; 
        this.isDead = false;
        this.isSpectating = false;
        this.spectateTarget = null;
        this.lastFired = 0; 
    }
    
    preload() {
        this.load.audio('shootSound', 'https://labs.phaser.io/assets/audio/SoundEffects/blaster.mp3');
        this.load.audio('hitSound', 'https://labs.phaser.io/assets/audio/SoundEffects/squit.wav');
    }

    create() {
        this.cameras.main.setBounds(0, 0, 2000, 2000);
        this.add.grid(1000, 1000, 2000, 2000, 50, 50, 0x000000, 1, 0x222222, 1);

        this.otherPlayers = this.add.group();
        
        // PC Fallback Controls
        this.cursors = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D
        });

        this.lastEmit = 0; 
        this.bullets = this.add.group({ classType: Phaser.GameObjects.Rectangle, maxSize: 50, runChildUpdate: false });
        
        for (let i = 0; i < 50; i++) {
            let b = this.add.rectangle(0, 0, 10, 10, 0xffff00);
            b.setActive(false).setVisible(false);
            this.bullets.add(b);
        }

        this.minimapBg = this.add.rectangle(0, 0, 150, 150, 0x111111, 0.9).setScrollFactor(0).setStrokeStyle(2, 0xffffff).setDepth(50);
        this.minimapGraphics = this.add.graphics().setScrollFactor(0).setDepth(51);

        this.scene.launch('UIScene', { parentScene: this });
        this.uiScene = this.scene.get('UIScene');
        
        globalSocket.off('matchInit');
        globalSocket.off('playerMoved');
        globalSocket.off('playerShot');
        globalSocket.off('gameStateUpdate');
        globalSocket.off('playerHit');
        globalSocket.off('youDied');
        globalSocket.off('playerEliminated');
        globalSocket.off('matchEnded');
        globalSocket.off('timerUpdate');

        globalSocket.on('matchInit', (data) => {
            this.uiScene.startCountdown();
            Object.keys(data.players).forEach(id => {
                let pData = data.players[id];
                if (id === globalSocket.id) this.addMe(this, pData);
                else this.addOther(this, pData);
            });
        });

        globalSocket.on('playerMoved', (pInfo) => {
            if (this.isDead && !this.isSpectating) return; 
            this.otherPlayers.getChildren().forEach(op => {
                if (pInfo.id === op.playerId) {
                    this.tweens.killTweensOf(op);
                    this.tweens.add({ targets: [op, op.hpBar, op.hpBg, op.shieldAura, op.crownIcon, op.face], x: pInfo.x, y: pInfo.y, duration: 50, ease: 'Linear' });
                }
            });
        });
        
        globalSocket.on('playerShot', (b) => {
            if (this.isDead && !this.isSpectating) return;
            this.sound.play('shootSound', { volume: 0.5 });
            this.fireBullet(b.x, b.y, b.vx, b.vy, false);
        });

        globalSocket.on('gameStateUpdate', (p) => {
            let sortedPlayers = Object.values(p).filter(pl => pl.inGame).sort((a,b) => b.score - a.score);
            this.uiScene.updateLeaderboard(sortedPlayers);

            if (p[globalSocket.id]) {
                this.updateHealthBar(this.ship, p[globalSocket.id].hp, p[globalSocket.id].maxHp);
                if(this.ship.shieldAura) this.ship.shieldAura.setVisible(p[globalSocket.id].invincible);
                if(this.ship) this.ship.score = p[globalSocket.id].score;
            }
            this.otherPlayers.getChildren().forEach(op => {
                if(p[op.playerId]) {
                    this.updateHealthBar(op, p[op.playerId].hp, p[op.playerId].maxHp);
                    if(op.shieldAura) op.shieldAura.setVisible(p[op.playerId].invincible);
                    op.score = p[op.playerId].score;
                }
            });
        });

        globalSocket.on('playerHit', () => { 
            if (!(this.isDead && !this.isSpectating)) this.sound.play('hitSound', { volume: 0.8 }); 
        });

        globalSocket.on('youDied', () => {
            this.isDead = true;
            this.ship.setVisible(false).setActive(false);
            this.ship.hpBar.setVisible(false);
            this.ship.hpBg.setVisible(false);
            this.ship.shieldAura.setVisible(false);
            this.ship.crownIcon.setVisible(false);
            if(this.ship.face) this.ship.face.setVisible(false);
            this.uiScene.showDeathScreen();
        });

        globalSocket.on('playerEliminated', (id) => this.removePlayer(id));
        globalSocket.on('matchEnded', (leaderboard) => { this.uiScene.showEndScreen(leaderboard); });
        globalSocket.on('timerUpdate', (timeString) => { this.uiScene.updateTimer(timeString); });

        setTimeout(() => { globalSocket.emit('playerReadyForMatch'); }, 200);
    }

    // Called perfectly from the UIScene Mobile Controls
    handleShoot(screenX, screenY) {
        if (!this.ship || this.isDead || this.uiScene.isCountdown || this.uiScene.isMatchEnded) return;
        
        let now = Date.now();
        if (now - this.lastFired < 1500) return;
        this.lastFired = now;

        this.sound.play('shootSound', { volume: 0.5 });
        
        let worldX = screenX + this.cameras.main.scrollX;
        let worldY = screenY + this.cameras.main.scrollY;
        
        let angle = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, worldX, worldY);
        let vx = Math.cos(angle) * 9, vy = Math.sin(angle) * 9;
        
        this.fireBullet(this.ship.x, this.ship.y, vx, vy, true);
        globalSocket.emit('shoot', { x: this.ship.x, y: this.ship.y, vx, vy });
    }

    update(time) {
        if (!this.ship || this.uiScene.isCountdown || this.uiScene.isMatchEnded) return; 
        if (this.isDead && !this.isSpectating) return;

        let sw = this.cameras.main.width;
        let sh = this.cameras.main.height;
        
        // Responsive minimap placement
        this.minimapBg.setPosition(sw - 90, sh - 90);

        let maxScore = 0;
        let leaderId = null;
        let allPlayers = this.otherPlayers.getChildren().concat(this.isDead ? [] : [this.ship]);
        
        allPlayers.forEach(p => {
            if (p.score > maxScore) { maxScore = p.score; leaderId = p.playerId || globalSocket.id; }
        });

        this.minimapGraphics.clear();
        let mmStartX = sw - 165; 
        let mmStartY = sh - 165;

        allPlayers.forEach(p => {
            let isLeader = (p.playerId || globalSocket.id) === leaderId && maxScore > 0;
            if (isLeader) p.crownIcon.setVisible(true).setPosition(p.x, p.y - 45);
            else if(p.crownIcon) p.crownIcon.setVisible(false);

            let mx = mmStartX + (p.x / 2000) * 150;
            let my = mmStartY + (p.y / 2000) * 150;
            
            this.minimapGraphics.fillStyle(p === this.ship ? 0x00aaff : 0xff0000, 1);
            this.minimapGraphics.fillCircle(mx, my, 4);

            if (isLeader) {
                this.minimapGraphics.fillStyle(0xffff00, 1);
                this.minimapGraphics.fillTriangle(mx - 6, my - 6, mx + 6, my - 6, mx, my - 14);
            }
        });

        this.bullets.getChildren().forEach(b => {
            if (b.active) {
                b.x += b.vx; b.y += b.vy;
                if (b.isMine) {
                    this.otherPlayers.getChildren().forEach(op => {
                        if (Math.abs(b.x - op.x) < 25 && Math.abs(b.y - op.y) < 25) {
                            b.setActive(false).setVisible(false);
                            globalSocket.emit('playerTagged', op.playerId);
                        }
                    });
                }
                if (b.x < 0 || b.x > 2000 || b.y < 0 || b.y > 2000) b.setActive(false).setVisible(false);
            }
        });

        if (this.isDead) return;
        
        const speed = this.ship.shieldAura && this.ship.shieldAura.visible ? 6 : 5; 
        let moved = false; const ox = this.ship.x, oy = this.ship.y;
        
        // Grab Virtual Joystick Vector
        let jx = this.uiScene.moveVector ? this.uiScene.moveVector.x : 0;
        let jy = this.uiScene.moveVector ? this.uiScene.moveVector.y : 0;
        
        // Keyboard fallback
        if (this.cursors.left.isDown) jx = -1;
        if (this.cursors.right.isDown) jx = 1;
        if (this.cursors.up.isDown) jy = -1;
        if (this.cursors.down.isDown) jy = 1;

        if (jx !== 0 || jy !== 0) {
            let length = Math.sqrt(jx*jx + jy*jy);
            if (length > 1) { jx /= length; jy /= length; } // Normalize diagonal speed
            
            this.ship.x += jx * speed;
            this.ship.y += jy * speed;
            moved = true;
        }

        this.ship.x = Phaser.Math.Clamp(this.ship.x, 25, 1975);
        this.ship.y = Phaser.Math.Clamp(this.ship.y, 25, 1975);

        if (moved) {
            this.updateHealthBar(this.ship, null, null);
            if(this.ship.shieldAura) this.ship.shieldAura.setPosition(this.ship.x, this.ship.y);
            if(this.ship.face) this.ship.face.setPosition(this.ship.x, this.ship.y);

            if (time > this.lastEmit + 50 && (this.ship.x !== ox || this.ship.y !== oy)) {
                globalSocket.emit('playerMovement', { x: this.ship.x, y: this.ship.y });
                this.lastEmit = time;
            }
        }
    }

    fireBullet(x, y, vx, vy, isMine) {
        let b = this.bullets.getFirstDead(false);
        if (b) { b.setActive(true).setVisible(true).setPosition(x, y); b.vx = vx; b.vy = vy; b.isMine = isMine; }
    }

    drawFace(g, colorIndex) {
        g.clear(); g.lineStyle(2, 0x222222, 1); g.fillStyle(0x222222, 1);
        switch(colorIndex) {
            case 0: g.lineBetween(-10, -5, -4, -1); g.lineBetween(10, -5, 4, -1); g.fillCircle(-7, 2, 2); g.fillCircle(7, 2, 2); g.beginPath(); g.arc(0, 12, 6, Math.PI, 0, false); g.strokePath(); break;
            case 1: g.lineBetween(-12, -8, -4, -2); g.lineBetween(12, -8, 4, -2); g.fillCircle(-7, 2, 2); g.fillCircle(7, 2, 2); g.lineBetween(-6, 12, 6, 12); break;
            case 2: g.lineBetween(-10, -2, -4, -5); g.lineBetween(4, -2, 10, -2); g.beginPath(); g.moveTo(-8, 10); g.lineTo(-4, 7); g.lineTo(0, 12); g.lineTo(4, 7); g.lineTo(8, 10); g.strokePath(); break;
            case 3: g.lineBetween(-10, -2, -4, -2); g.lineBetween(4, -8, 10, -3); g.fillCircle(-7, 2, 2); g.fillCircle(7, 2, 2); g.lineBetween(-5, 10, 7, 6); break;
            case 4: g.strokeCircle(-7, -2, 3); g.strokeCircle(7, -2, 3); g.strokeCircle(0, 10, 4); break;
            case 5: g.lineBetween(-10, -2, -4, -2); g.lineBetween(4, -2, 10, -2); g.beginPath(); g.moveTo(-6, 10); g.lineTo(-3, 8); g.lineTo(0, 12); g.lineTo(3, 8); g.lineTo(6, 10); g.strokePath(); break;
            case 6: g.fillCircle(-7, -2, 4); g.fillCircle(7, -2, 4); g.beginPath(); g.arc(-4, 8, 4, 0, Math.PI, false); g.arc(4, 8, 4, 0, Math.PI, false); g.strokePath(); break;
            case 7: g.fillRect(-12, -6, 10, 8); g.fillRect(2, -6, 10, 8); g.lineBetween(-2, -2, 2, -2); g.beginPath(); g.arc(0, 6, 6, 0, Math.PI, false); g.strokePath(); break;
        }
    }

    addMe(scene, info) { 
        scene.ship = scene.add.rectangle(info.x, info.y, 50, 50, GAME_COLORS[info.colorIndex]); 
        scene.ship.face = scene.add.graphics({ x: info.x, y: info.y }).setDepth(5);
        this.drawFace(scene.ship.face, info.colorIndex);
        scene.ship.shieldAura = scene.add.circle(info.x, info.y, 35, 0xffffff, 0.4).setVisible(true);
        scene.ship.crownIcon = scene.add.text(0, 0, '👑', { fontSize: '24px' }).setOrigin(0.5).setVisible(false).setDepth(10);
        scene.ship.score = 0;
        this.createHealthBar(scene.ship, 100);
        this.cameras.main.startFollow(scene.ship);
    }

    addOther(scene, info) { 
        const op = scene.add.rectangle(info.x, info.y, 50, 50, GAME_COLORS[info.colorIndex]); 
        op.playerId = info.id; 
        op.face = scene.add.graphics({ x: info.x, y: info.y }).setDepth(5);
        this.drawFace(op.face, info.colorIndex);
        op.shieldAura = scene.add.circle(info.x, info.y, 35, 0xffffff, 0.4).setVisible(true);
        op.crownIcon = scene.add.text(0, 0, '👑', { fontSize: '24px' }).setOrigin(0.5).setVisible(false).setDepth(10);
        op.score = 0;
        this.createHealthBar(op, info.hp);
        scene.otherPlayers.add(op); 
    }

    createHealthBar(playerData, initialHp) {
        playerData.hpBg = this.add.rectangle(playerData.x, playerData.y - 35, 40, 8, 0x000000);
        playerData.hpBar = this.add.rectangle(playerData.x, playerData.y - 35, 40, 8, 0x00ff00);
        playerData.currentHp = initialHp || 100;
    }

    updateHealthBar(playerData, newHp, maxHp) {
        if(!playerData || !playerData.hpBg || !playerData.hpBar) return;
        if(newHp !== null) playerData.currentHp = newHp;
        maxHp = maxHp || 100;
        playerData.hpBg.setPosition(playerData.x, playerData.y - 35);
        playerData.hpBar.setPosition(playerData.x, playerData.y - 35);
        let healthPercent = Math.max(0, playerData.currentHp / maxHp);
        playerData.hpBar.width = 40 * healthPercent;
        if (healthPercent < 0.3) playerData.hpBar.setFillStyle(0xff0000);
        else if (healthPercent < 0.6) playerData.hpBar.setFillStyle(0xffff00);
        else playerData.hpBar.setFillStyle(0x00ff00);
    }

    removePlayer(id) {
        this.otherPlayers.getChildren().forEach(op => { 
            if (id === op.playerId) {
                if(op.hpBar) op.hpBar.destroy(); if(op.hpBg) op.hpBg.destroy(); 
                if(op.shieldAura) op.shieldAura.destroy(); if(op.crownIcon) op.crownIcon.destroy();
                if(op.face) op.face.destroy();

                if (this.isSpectating && this.spectateTarget === op) {
                    let remaining = this.otherPlayers.getChildren().filter(p => p !== op);
                    if (remaining.length > 0) {
                        this.spectateTarget = remaining[0];
                        this.cameras.main.startFollow(this.spectateTarget);
                    } else { this.spectateTarget = null; }
                }
                op.destroy(); 
            } 
        });
    }
}

class UIScene extends Phaser.Scene {
    constructor() { super('UIScene'); }
    
    init(data) { 
        this.gameScene = data.parentScene; 
        this.isCountdown = true; 
        this.isMatchEnded = false;
    }

    create() {
        this.input.addPointer(3); // Support up to 3 fingers

        this.add.rectangle(10, 10, 200, 150, 0x000000, 0.5).setOrigin(0,0);
        this.add.text(20, 20, 'LEADERBOARD', { fontSize: '14px', fill: '#ffff00', fontStyle: 'bold' });
        this.leaderboardText = this.add.text(20, 40, 'Loading...', { fontSize: '12px', fill: '#ffffff' });

        this.timerText = this.add.text(this.cameras.main.centerX, 20, '05:00', { fontSize: '28px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
        this.aliveText = this.add.text(this.cameras.main.width - 20, 50, 'Alive: 0', { fontSize: '16px', fill: '#fff', fontStyle: 'bold' }).setOrigin(1, 0);

        this.pauseBg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.8).setOrigin(0,0).setVisible(false);
        this.pauseText = this.add.text(this.cameras.main.centerX, 200, 'PAUSED', { fontSize: '36px', fill: '#fff' }).setOrigin(0.5).setVisible(false);
        
        this.muteBtn = this.add.text(this.cameras.main.centerX, 300, 'TOGGLE MUTE', { fontSize: '20px', backgroundColor: '#444', padding: {x:10, y:5} }).setOrigin(0.5).setInteractive().setVisible(false);
        this.muteBtn.on('pointerdown', () => { this.sound.mute = !this.sound.mute; this.muteBtn.setBackgroundColor(this.sound.mute ? '#800' : '#444'); });
        
        this.exitBtn = this.add.text(this.cameras.main.centerX, 400, 'RETURN TO LOBBY', { fontSize: '20px', backgroundColor: '#800', padding: {x:10, y:5} }).setOrigin(0.5).setInteractive().setVisible(false);
        this.exitBtn.on('pointerdown', () => {
            globalSocket.emit('returnToLobby');
            this.scene.stop('GameScene');
            this.scene.start('LobbyScene', { roomCode: this.gameScene.roomCode }); 
            this.scene.stop(); 
        });

        const pauseToggle = this.add.text(this.cameras.main.width - 20, 15, '⏸ PAUSE', { fontSize: '14px', fill: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(1, 0).setInteractive();
        this.isPausedLocally = false;
        pauseToggle.on('pointerdown', () => {
            if(this.isCountdown || this.gameScene.isDead || this.isMatchEnded) return;
            this.isPausedLocally = !this.isPausedLocally;
            this.pauseBg.setVisible(this.isPausedLocally);
            this.pauseText.setVisible(this.isPausedLocally);
            this.muteBtn.setVisible(this.isPausedLocally);
            this.exitBtn.setVisible(this.isPausedLocally);
        });

        this.countdownText = this.add.text(this.cameras.main.centerX, this.cameras.main.centerY, '5', { fontSize: '80px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);

        // --- NEW: STATIC VIRTUAL JOYSTICK ---
        // Fixed coordinates in the bottom left corner
        this.joyBaseX = 120; 
        this.joyBaseY = this.cameras.main.height - 120; 
        this.joystickBase = this.add.circle(this.joyBaseX, this.joyBaseY, 60, 0x000000, 0.5).setStrokeStyle(4, 0xffffff, 0.6).setDepth(100);
        this.joystickThumb = this.add.circle(this.joyBaseX, this.joyBaseY, 30, 0xffffff, 0.9).setDepth(100);
        this.moveVector = { x: 0, y: 0 };

        // Tap to Shoot (Only responds to right half of screen)
        this.input.on('pointerdown', (ptr) => {
            if (this.isCountdown || this.gameScene.isDead || this.isMatchEnded || this.isPausedLocally) return;

            const screenCenter = this.cameras.main.width / 2;
            if (ptr.x >= screenCenter) {
                this.gameScene.handleShoot(ptr.x, ptr.y);
            }
        });
    }

    // NEW: Polling loop runs every frame. Never drops touches.
    update() {
        if (this.isCountdown || this.gameScene.isDead || this.isMatchEnded || this.isPausedLocally) return;

        let joystickActive = false;
        const screenCenter = this.cameras.main.width / 2;

        // Check every finger touching the screen
        for (let ptr of this.input.pointers) {
            // If a finger is pressed down on the left half of the screen
            if (ptr.isDown && ptr.x < screenCenter) {
                let dx = ptr.x - this.joyBaseX;
                let dy = ptr.y - this.joyBaseY;
                let dist = Math.sqrt(dx * dx + dy * dy);
                let maxDist = 60;

                // Lock thumb visual inside the base ring
                if (dist > maxDist) {
                    dx = (dx / dist) * maxDist;
                    dy = (dy / dist) * maxDist;
                }

                this.joystickThumb.setPosition(this.joyBaseX + dx, this.joyBaseY + dy);
                this.moveVector.x = dx / maxDist;
                this.moveVector.y = dy / maxDist;
                joystickActive = true;
                break; // Only use one finger for movement
            }
        }

        // Snap joystick back to center if no fingers are down on left side
        if (!joystickActive) {
            this.joystickThumb.setPosition(this.joyBaseX, this.joyBaseY);
            this.moveVector.x = 0;
            this.moveVector.y = 0;
        }
    }

    startCountdown() {
        let count = 5;
        let intv = setInterval(() => {
            count--;
            if(count > 0) this.countdownText.setText(count);
            else {
                clearInterval(intv);
                this.countdownText.setText('FIGHT!');
                setTimeout(() => { this.countdownText.setVisible(false); this.isCountdown = false; }, 1000);
            }
        }, 1000);
    }

    updateLeaderboard(playersArray) {
        let text = "";
        let aliveCount = 0;
        playersArray.forEach((p, i) => {
            text += `${i+1}. ${p.name} - ${p.score}pts (${p.deaths} D)\n`;
            if (p.hp > 0) aliveCount++;
        });
        this.leaderboardText.setText(text);
        this.aliveText.setText(`Alive: ${aliveCount}`);
    }

    updateTimer(timeStr) { this.timerText.setText(timeStr); }

    showDeathScreen() {
        if (this.isMatchEnded) return; 
        
        this.deathBg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xff0000, 0.3).setOrigin(0,0);
        this.deathText = this.add.text(this.cameras.main.centerX, 150, 'YOU DIED', { fontSize: '48px', fill: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
        
        this.specBtn = this.add.text(this.cameras.main.centerX, 250, 'SPECTATE NEXT', { fontSize: '20px', backgroundColor: '#333', padding: {x:10, y:5} }).setOrigin(0.5).setInteractive();
        this.specBtn.on('pointerdown', () => {
            let others = this.gameScene.otherPlayers.getChildren();
            if(others.length > 0) {
                this.gameScene.isSpectating = true;
                this.deathBg.setVisible(false);
                this.deathText.setVisible(false);
                
                this.specBtn.setPosition(this.cameras.main.centerX - 100, this.cameras.main.height - 50);
                this.lobBtn.setPosition(this.cameras.main.centerX + 100, this.cameras.main.height - 50);

                let specTarget = others[Math.floor(Math.random() * others.length)];
                this.gameScene.spectateTarget = specTarget;
                this.gameScene.cameras.main.startFollow(specTarget);
            }
        });

        this.lobBtn = this.add.text(this.cameras.main.centerX, 320, 'RETURN TO LOBBY', { fontSize: '20px', backgroundColor: '#800', padding: {x:10, y:5} }).setOrigin(0.5).setInteractive();
        this.lobBtn.on('pointerdown', () => {
            globalSocket.emit('returnToLobby');
            this.scene.stop('GameScene');
            this.scene.start('LobbyScene', { roomCode: this.gameScene.roomCode });
            this.scene.stop();
        });
    }

    showEndScreen(leaderboard) {
        this.isMatchEnded = true;
        this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 1.0).setOrigin(0,0).setDepth(100).setInteractive(); 

        this.add.text(this.cameras.main.centerX, 100, 'MATCH ENDED', { fontSize: '48px', fill: '#00ff00', fontStyle: 'bold' }).setOrigin(0.5).setDepth(101);
        
        let winText = leaderboard.length > 0 ? `${leaderboard[0].name} WINS!` : "DRAW!";
        this.add.text(this.cameras.main.centerX, 160, winText, { fontSize: '36px', fill: '#ffff00' }).setOrigin(0.5).setDepth(101);
        
        let boardText = "";
        leaderboard.forEach((p, i) => { boardText += `${i+1}. ${p.name} - ${p.score} pts (${p.deaths} D)\n`; });
        this.add.text(this.cameras.main.centerX, 250, boardText, { fontSize: '20px', fill: '#fff', align: 'center' }).setOrigin(0.5, 0).setDepth(101);

        this.add.text(this.cameras.main.centerX, this.cameras.main.height - 60, 'Returning to Lobby...', { fontSize: '18px', fill: '#aaa' }).setOrigin(0.5).setDepth(101);

        setTimeout(() => {
             globalSocket.emit('returnToLobby');
             this.scene.stop('GameScene');
             this.scene.start('LobbyScene', { roomCode: this.gameScene.roomCode });
             this.scene.stop();
        }, 8000);
    }
}

const config = { 
    type: Phaser.AUTO, 
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, 
    parent: 'game-container', 
    scene: [MenuScene, LobbyScene, GameScene, UIScene] 
};
new Phaser.Game(config);
