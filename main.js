import * as Phaser from 'phaser';
import { io } from 'socket.io-client';

const GAME_COLORS = [0x0000ff, 0xff0000, 0x00ff00, 0x9900ff, 0xff9900, 0x00ffff, 0xff00ff, 0xffff00];
let globalSocket = io('https://phaser-multiplayer-arena.onrender.com', { autoConnect: false, transports: ['websocket'] });
let myPlayerName = "Anonymous";

const createTxt = (scene, x, y, txt, size, color, bold=true) => scene.add.text(x, y, txt, { fontSize: size, fill: color, fontStyle: bold ? 'bold' : 'normal' }).setOrigin(0.5);
const createBtn = (scene, x, y, w, h, color, txt) => {
    let btn = scene.add.rectangle(x, y, w, h, color).setInteractive();
    let label = createTxt(scene, x, y, txt, '20px', '#000');
    return { btn, label };
};

class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }

    create() {
        if (!globalSocket.connected) globalSocket.connect();
        const cx = this.cameras.main.centerX, cy = this.cameras.main.centerY;

        this.statusText = createTxt(this, cx, 30, '🟡 Waking up server...', '16px', '#ffff00');
        globalSocket.on('connect', () => this.statusText.setText('🟢 Server Online!').setFill('#00ff00'));
        globalSocket.on('connect_error', () => this.statusText.setText('🔴 Cannot reach server. Retrying...').setFill('#ff0000'));

        let input = document.getElementById('playerNameInput');
        if (!input) {
            input = document.createElement('input'); input.id = 'playerNameInput'; input.type = 'text'; input.placeholder = 'Enter Player Name...';
            // CSS Minification
            Object.assign(input.style, { position:'absolute', top:'25%', left:'50%', transform:'translate(-50%, -50%)', fontSize:'20px', padding:'10px', textAlign:'center', zIndex:'1000', background:'#111', color:'#00ff00', border:'2px solid #00ff00', outline:'none', width:'80%', maxWidth:'300px' });
            document.body.appendChild(input);
        } else input.style.display = 'block';

        createTxt(this, cx, cy - 100, 'MULTIPLAYER ARENA', '32px', '#ffffff');
        createTxt(this, cx, cy - 50, '📱 Mobile: Left moves | Right shoots', '14px', '#aaa', false);

        const host = createBtn(this, cx, cy + 30, 200, 50, 0x00ff00, 'HOST GAME');
        host.btn.on('pointerdown', () => this.handleJoin(input, 'createRoom'));

        const join = createBtn(this, cx, cy + 100, 200, 50, 0x00aaff, 'JOIN GAME');
        join.btn.on('pointerdown', () => this.handleJoin(input, 'joinRoom'));

        ['roomCreated', 'roomJoined', 'joinError'].forEach(e => globalSocket.off(e));
        globalSocket.on('roomCreated', (code) => this.scene.start('LobbyScene', { roomCode: code }));
        globalSocket.on('roomJoined', (code) => this.scene.start('LobbyScene', { roomCode: code }));
        globalSocket.on('joinError', (msg) => { alert(msg); input.style.display = 'block'; });
    }

    handleJoin(input, action) {
        let name = input.value.trim();
        if(!name) return alert("Name required!");
        if(!globalSocket.connected) return alert("Still connecting!");
        myPlayerName = name; input.style.display = 'none';
        
        if (action === 'joinRoom') {
            let code = prompt("Enter 6-character Party Code:");
            if (code && code.length === 6) globalSocket.emit(action, { code: code.toUpperCase(), name });
            else { alert("Invalid code."); input.style.display = 'block'; }
        } else globalSocket.emit(action, name);
    }
}

class LobbyScene extends Phaser.Scene {
    constructor() { super('LobbyScene'); }
    init(data) { this.roomCode = data.roomCode; this.isReady = false; this.playersInLobby = {}; }

    create() {
        const cx = this.cameras.main.centerX, cy = this.cameras.main.height;
        
        let leaveBtn = createTxt(this, 80, 30, '⬅ LEAVE LOBBY', '18px', '#fff').setBackgroundColor('#aa0000').setInteractive();
        leaveBtn.on('pointerdown', () => { globalSocket.emit('leaveRoom'); this.scene.start('MenuScene'); });

        createTxt(this, cx, 80, `PARTY: ${this.roomCode}`, '32px', '#ffff00');
        this.playerListText = createTxt(this, cx, 130, 'Loading...', '20px', '#fff', false).setOrigin(0.5, 0);

        let ready = createBtn(this, cx, cy - 150, 200, 50, 0x999999, 'NOT READY');
        ready.btn.on('pointerdown', () => {
            this.isReady = !this.isReady;
            ready.btn.setFillStyle(this.isReady ? 0x00ff00 : 0x999999);
            ready.label.setText(this.isReady ? 'READY' : 'NOT READY');
            globalSocket.emit('toggleReady', this.isReady);
        });

        this.startUI = createBtn(this, cx, cy - 70, 250, 60, 0x555555, 'START GAME');
        this.startUI.btn.setVisible(false); this.startUI.label.setVisible(false);
        
        this.startUI.btn.on('pointerdown', () => {
            let vals = Object.values(this.playersInLobby);
            if (vals.some(p => p.inGame)) return alert("Wait for current match to end!");
            if (!vals.every(p => p.ready)) return alert("All players must be ready!");
            globalSocket.emit('startGame');
        });

        globalSocket.off('lobbyUpdate'); globalSocket.off('gameStarting');
        globalSocket.on('lobbyUpdate', (players) => {
            this.playersInLobby = players; let list = "", allReady = true, inGame = false, amIHost = false;
            Object.values(players).forEach(p => {
                list += `${p.name}${p.isHost ? " [HOST]" : ""} ${p.inGame ? "(In-Game)" : (p.ready ? "🟢 READY" : "🔴 NOT READY")}\n`;
                if(!p.ready) allReady = false; if(p.inGame) inGame = true;
                if (p.name === myPlayerName && p.isHost) amIHost = true;
            });
            this.playerListText.setText(list);
            this.startUI.btn.setVisible(amIHost); this.startUI.label.setVisible(amIHost);
            if (amIHost) this.startUI.btn.setFillStyle((allReady && !inGame) ? 0xffa500 : 0x555555);
        });
        globalSocket.on('gameStarting', () => this.scene.start('GameScene', { roomCode: this.roomCode }));
        globalSocket.emit('requestLobbyData');
    }
}

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }
    init(data) { this.roomCode = data.roomCode; this.isDead = false; this.isSpectating = false; this.spectateTarget = null; this.lastFired = 0; }
    
    preload() {
        this.load.audio('shootSound', 'https://labs.phaser.io/assets/audio/SoundEffects/blaster.mp3');
        this.load.audio('hitSound', 'https://labs.phaser.io/assets/audio/SoundEffects/squit.wav');
        this.load.audio('bgm', 'https://labs.phaser.io/assets/audio/oedipus_wizball_highscore.mp3'); 
    }

    create() {
        this.cameras.main.setBounds(0, 0, 2000, 2000);
        this.add.grid(1000, 1000, 2000, 2000, 50, 50, 0x000000, 1, 0x222222, 1);

        this.bgm = this.sound.add('bgm', { volume: 0.15, loop: true }); this.bgm.play();
        this.events.on('shutdown', () => { if (this.bgm) this.bgm.stop(); });

        this.otherPlayers = this.add.group();
        this.cursors = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
        this.bullets = this.add.group({ classType: Phaser.GameObjects.Rectangle, maxSize: 50 });
        for(let i=0; i<50; i++) this.bullets.add(this.add.rectangle(0,0,10,10,0xffff00).setActive(false).setVisible(false));

        this.minimapBg = this.add.rectangle(0, 0, 150, 150, 0x111111, 0.9).setScrollFactor(0).setStrokeStyle(2, 0xffffff).setDepth(50);
        this.minimapGraphics = this.add.graphics().setScrollFactor(0).setDepth(51);

        this.scene.launch('UIScene', { parentScene: this }); this.uiScene = this.scene.get('UIScene');
        
        ['matchInit','playerMoved','playerShot','gameStateUpdate','playerHit','youDied','playerEliminated','matchEnded','timerUpdate'].forEach(e => globalSocket.off(e));

        globalSocket.on('matchInit', (data) => {
            this.uiScene.startCountdown();
            Object.keys(data.players).forEach(id => this.spawnPlayer(data.players[id], id === globalSocket.id));
        });

        globalSocket.on('playerMoved', (p) => {
            if (this.isDead && !this.isSpectating) return; 
            this.otherPlayers.getChildren().filter(op => op.playerId === p.id).forEach(op => {
                this.tweens.add({ targets: [op, op.hpBar, op.hpBg, op.shieldAura, op.crownIcon, op.face], x: p.x, y: p.y, duration: 50 });
                if(op.face) op.face.rotation = p.angle || 0;
            });
        });
        
        globalSocket.on('playerShot', (b) => {
            if (this.isDead && !this.isSpectating) return;
            this.sound.play('shootSound', { volume: 0.5 }); this.fireBullet(b.x, b.y, b.vx, b.vy, false);
        });

        globalSocket.on('gameStateUpdate', (p) => {
            this.uiScene.updateLeaderboard(Object.values(p).filter(pl => pl.inGame).sort((a,b) => b.score - a.score));
            if (p[globalSocket.id]) this.updateHealthBar(this.ship, p[globalSocket.id]);
            this.otherPlayers.getChildren().forEach(op => { if(p[op.playerId]) this.updateHealthBar(op, p[op.playerId]); });
        });

        globalSocket.on('playerHit', () => { if (!(this.isDead && !this.isSpectating)) this.sound.play('hitSound', { volume: 0.8 }); });
        globalSocket.on('youDied', () => {
            this.isDead = true;
            [this.ship, this.ship.hpBar, this.ship.hpBg, this.ship.shieldAura, this.ship.crownIcon, this.ship.face].forEach(e => { if(e) e.setVisible(false); });
            this.uiScene.showDeathScreen();
        });

        globalSocket.on('playerEliminated', (id) => this.removePlayer(id));
        globalSocket.on('matchEnded', (board) => this.uiScene.showEndScreen(board));
        globalSocket.on('timerUpdate', (t) => this.uiScene.timerText.setText(t));

        this.input.on('pointerdown', (ptr) => {
            if (this.uiScene.hasTouch || !this.ship || this.isDead || this.uiScene.isCountdown || this.uiScene.isMatchEnded) return;
            let angle = Phaser.Math.Angle.Between(this.ship.x, this.ship.y, ptr.x + this.cameras.main.scrollX, ptr.y + this.cameras.main.scrollY);
            this.ship.facingAngle = angle; if(this.ship.face) this.ship.face.rotation = angle;
            this.processShot(Math.cos(angle) * 9, Math.sin(angle) * 9);
        });

        setTimeout(() => globalSocket.emit('playerReadyForMatch'), 200);
    }

    handleMobileShoot() {
        if (!this.ship || this.isDead || this.uiScene.isCountdown || this.uiScene.isMatchEnded) return;
        this.processShot(Math.cos(this.ship.facingAngle) * 9, Math.sin(this.ship.facingAngle) * 9);
    }

    processShot(vx, vy) {
        let now = Date.now(); if (now - this.lastFired < 1500) return;
        this.lastFired = now; this.sound.play('shootSound', { volume: 0.5 });
        this.fireBullet(this.ship.x, this.ship.y, vx, vy, true);
        globalSocket.emit('shoot', { x: this.ship.x, y: this.ship.y, vx, vy });
    }

    update(time) {
        if (!this.ship || this.uiScene.isCountdown || this.uiScene.isMatchEnded) return; 
        if (this.isDead && !this.isSpectating) return;

        let sw = this.cameras.main.width, sh = this.cameras.main.height;
        this.minimapBg.setPosition(sw - 90, sh - 90);

        let maxScore = 0, leaderId = null;
        let all = this.otherPlayers.getChildren().concat(this.isDead ? [] : [this.ship]);
        all.forEach(p => { if (p.score > maxScore) { maxScore = p.score; leaderId = p.playerId || globalSocket.id; }});

        this.minimapGraphics.clear();
        all.forEach(p => {
            let isLeader = (p.playerId || globalSocket.id) === leaderId && maxScore > 0;
            if(p.crownIcon) p.crownIcon.setVisible(isLeader).setPosition(p.x, p.y - 45);
            let mx = (sw - 165) + (p.x / 2000) * 150, my = (sh - 165) + (p.y / 2000) * 150;
            this.minimapGraphics.fillStyle(p === this.ship ? 0x00aaff : 0xff0000, 1).fillCircle(mx, my, 4);
            if(isLeader) this.minimapGraphics.fillStyle(0xffff00, 1).fillTriangle(mx-6, my-6, mx+6, my-6, mx, my-14);
        });

        this.bullets.getChildren().filter(b => b.active).forEach(b => {
            b.x += b.vx; b.y += b.vy;
            if (b.isMine) this.otherPlayers.getChildren().forEach(op => {
                if (Phaser.Math.Distance.Between(b.x, b.y, op.x, op.y) < 25) { b.setActive(false).setVisible(false); globalSocket.emit('playerTagged', op.playerId); }
            });
            if (b.x < 0 || b.x > 2000 || b.y < 0 || b.y > 2000) b.setActive(false).setVisible(false);
        });

        if (this.isDead) return;
        
        let jx = (this.uiScene.hasTouch && this.uiScene.moveVector) ? this.uiScene.moveVector.x : 0;
        let jy = (this.uiScene.hasTouch && this.uiScene.moveVector) ? this.uiScene.moveVector.y : 0;
        
        if (this.cursors.left.isDown) jx = -1; if (this.cursors.right.isDown) jx = 1;
        if (this.cursors.up.isDown) jy = -1; if (this.cursors.down.isDown) jy = 1;

        if (jx !== 0 || jy !== 0) {
            let l = Math.sqrt(jx*jx + jy*jy); if (l > 1) { jx /= l; jy /= l; } 
            let spd = this.ship.shieldAura.visible ? 6 : 5;
            this.ship.x = Phaser.Math.Clamp(this.ship.x + (jx * spd), 25, 1975);
            this.ship.y = Phaser.Math.Clamp(this.ship.y + (jy * spd), 25, 1975);
            this.ship.facingAngle = Math.atan2(jy, jx);
            if (this.ship.face) this.ship.face.rotation = this.ship.facingAngle;

            this.updateHealthBar(this.ship, null);
            this.ship.shieldAura.setPosition(this.ship.x, this.ship.y);
            this.ship.face.setPosition(this.ship.x, this.ship.y);

            if (time > (this.lastEmit || 0) + 50) {
                globalSocket.emit('playerMovement', { x: this.ship.x, y: this.ship.y, angle: this.ship.facingAngle });
                this.lastEmit = time;
            }
        }
    }

    fireBullet(x, y, vx, vy, isMine) {
        let b = this.bullets.getFirstDead(false);
        if (b) { b.setActive(true).setVisible(true).setPosition(x, y); b.vx = vx; b.vy = vy; b.isMine = isMine; }
    }

    drawFace(g, c) {
        g.clear(); g.lineStyle(2, 0x222222, 1); g.fillStyle(0x222222, 1);
        const dr = (ops) => ops.forEach(op => op());
        switch(c) {
            case 0: dr([()=>g.lineBetween(-10,-5,-4,-1), ()=>g.lineBetween(10,-5,4,-1), ()=>g.fillCircle(-7,2,2), ()=>g.fillCircle(7,2,2), ()=>g.beginPath(), ()=>g.arc(0,12,6,Math.PI,0,false), ()=>g.strokePath()]); break;
            case 1: dr([()=>g.lineBetween(-12,-8,-4,-2), ()=>g.lineBetween(12,-8,4,-2), ()=>g.fillCircle(-7,2,2), ()=>g.fillCircle(7,2,2), ()=>g.lineBetween(-6,12,6,12)]); break;
            case 2: dr([()=>g.lineBetween(-10,-2,-4,-5), ()=>g.lineBetween(4,-2,10,-2), ()=>g.beginPath(), ()=>g.moveTo(-8,10), ()=>g.lineTo(-4,7), ()=>g.lineTo(0,12), ()=>g.lineTo(4,7), ()=>g.lineTo(8,10), ()=>g.strokePath()]); break;
            case 3: dr([()=>g.lineBetween(-10,-2,-4,-2), ()=>g.lineBetween(4,-8,10,-3), ()=>g.fillCircle(-7,2,2), ()=>g.fillCircle(7,2,2), ()=>g.lineBetween(-5,10,7,6)]); break;
            case 4: dr([()=>g.strokeCircle(-7,-2,3), ()=>g.strokeCircle(7,-2,3), ()=>g.strokeCircle(0,10,4)]); break;
            case 5: dr([()=>g.lineBetween(-10,-2,-4,-2), ()=>g.lineBetween(4,-2,10,-2), ()=>g.beginPath(), ()=>g.moveTo(-6,10), ()=>g.lineTo(-3,8), ()=>g.lineTo(0,12), ()=>g.lineTo(3,8), ()=>g.lineTo(6,10), ()=>g.strokePath()]); break;
            case 6: dr([()=>g.fillCircle(-7,-2,4), ()=>g.fillCircle(7,-2,4), ()=>g.beginPath(), ()=>g.arc(-4,8,4,0,Math.PI,false), ()=>g.arc(4,8,4,0,Math.PI,false), ()=>g.strokePath()]); break;
            case 7: dr([()=>g.fillRect(-12,-6,10,8), ()=>g.fillRect(2,-6,10,8), ()=>g.lineBetween(-2,-2,2,-2), ()=>g.beginPath(), ()=>g.arc(0,6,6,0,Math.PI,false), ()=>g.strokePath()]); break;
        }
    }

    // Minified Spawner (Handles both Me and Others)
    spawnPlayer(info, isMe) { 
        let p = this.add.rectangle(info.x, info.y, 50, 50, GAME_COLORS[info.colorIndex]); 
        p.playerId = info.id; p.facingAngle = 0; p.score = 0;
        p.face = this.add.graphics({ x: info.x, y: info.y }).setDepth(5); this.drawFace(p.face, info.colorIndex);
        p.shieldAura = this.add.circle(info.x, info.y, 35, 0xffffff, 0.4);
        p.crownIcon = createTxt(this, 0, 0, '👑', '24px', '#fff').setVisible(false).setDepth(10);
        
        p.hpBg = this.add.rectangle(p.x, p.y - 35, 40, 8, 0x000000);
        p.hpBar = this.add.rectangle(p.x, p.y - 35, 40, 8, 0x00ff00);
        this.updateHealthBar(p, { hp: info.hp || 100, maxHp: 100, invincible: true, score: 0 });

        if (isMe) { this.ship = p; this.cameras.main.startFollow(p); }
        else this.otherPlayers.add(p);
    }

    updateHealthBar(p, serverData) {
        if(!p || !p.hpBar) return;
        if(serverData) { 
            p.currentHp = serverData.hp; p.maxHp = serverData.maxHp || 100; p.score = serverData.score;
            if(p.shieldAura) p.shieldAura.setVisible(serverData.invincible); 
        }
        p.hpBg.setPosition(p.x, p.y - 35); p.hpBar.setPosition(p.x, p.y - 35);
        let pct = Math.max(0, p.currentHp / (p.maxHp || 100));
        p.hpBar.width = 40 * pct;
        p.hpBar.setFillStyle(pct < 0.3 ? 0xff0000 : (pct < 0.6 ? 0xffff00 : 0x00ff00));
    }

    removePlayer(id) {
        this.otherPlayers.getChildren().filter(op => op.playerId === id).forEach(op => {
            [op.hpBar, op.hpBg, op.shieldAura, op.crownIcon, op.face, op].forEach(e => { if(e) e.destroy(); });
            if (this.isSpectating && this.spectateTarget === op) {
                let rem = this.otherPlayers.getChildren();
                this.spectateTarget = rem.length ? rem[0] : null;
                if(this.spectateTarget) this.cameras.main.startFollow(this.spectateTarget);
            }
        });
    }
}

class UIScene extends Phaser.Scene {
    constructor() { super('UIScene'); }
    init(data) { this.gameScene = data.parentScene; this.isCountdown = true; this.isMatchEnded = false; }

    create() {
        this.add.rectangle(10, 10, 200, 150, 0x000000, 0.5).setOrigin(0,0);
        createTxt(this, 110, 20, 'LEADERBOARD', '14px', '#ffff00');
        this.leaderboardText = createTxt(this, 110, 80, 'Loading...', '12px', '#fff', false);
        this.timerText = createTxt(this, this.cameras.main.centerX, 20, '05:00', '28px', '#fff');
        this.aliveText = createTxt(this, this.cameras.main.width - 60, 50, 'Alive: 0', '16px', '#fff');

        this.pauseBg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.8).setOrigin(0,0).setVisible(false);
        this.pauseText = createTxt(this, this.cameras.main.centerX, 200, 'PAUSED', '36px', '#fff').setVisible(false);
        
        let muteBtn = createTxt(this, this.cameras.main.centerX, 300, 'TOGGLE MUTE', '20px', '#fff').setBackgroundColor('#444').setInteractive().setVisible(false);
        muteBtn.on('pointerdown', () => { this.sound.mute = !this.sound.mute; muteBtn.setBackgroundColor(this.sound.mute ? '#800' : '#444'); });
        
        let exitBtn = createTxt(this, this.cameras.main.centerX, 400, 'RETURN TO LOBBY', '20px', '#fff').setBackgroundColor('#800').setInteractive().setVisible(false);
        exitBtn.on('pointerdown', () => { globalSocket.emit('returnToLobby'); this.scene.stop('GameScene'); this.scene.start('LobbyScene', { roomCode: this.gameScene.roomCode }); this.scene.stop(); });

        let pauseToggle = createTxt(this, this.cameras.main.width - 60, 25, '⏸ PAUSE', '14px', '#fff').setBackgroundColor('#333').setInteractive();
        this.isPausedLocally = false;
        pauseToggle.on('pointerdown', () => {
            if(this.isCountdown || this.gameScene.isDead || this.isMatchEnded) return;
            this.isPausedLocally = !this.isPausedLocally;
            [this.pauseBg, this.pauseText, muteBtn, exitBtn].forEach(e => e.setVisible(this.isPausedLocally));
        });

        this.countdownText = createTxt(this, this.cameras.main.centerX, this.cameras.main.centerY, '5', '80px', '#fff');
        this.hasTouch = this.sys.game.device.input.touch;

        if (this.hasTouch) {
            this.input.addPointer(3); this.moveVector = { x: 0, y: 0 };
            const makeCircle = (x, y, r, c, a, str) => this.add.circle(x, y, r, c, a).setStrokeStyle(4, str, 0.8).setDepth(100).setScrollFactor(0);
            
            this.joystickBase = makeCircle(0, 0, 60, 0x555555, 0.5, 0xffffff).setVisible(false);
            this.joystickThumb = makeCircle(0, 0, 30, 0xffffff, 1, 0xffffff).setVisible(false);
            this.joystickPointer = null;

            this.fireBtn = makeCircle(0, 0, 50, 0xff0000, 0.6, 0xffffff).setInteractive();
            this.fireText = createTxt(this, 0, 0, 'FIRE', '24px', '#fff').setDepth(101).setScrollFactor(0);

            this.fireBtn.on('pointerdown', () => { if (!this.isPausedLocally) this.gameScene.handleMobileShoot(); });

            this.input.on('pointerdown', (ptr) => {
                if (this.isCountdown || this.gameScene.isDead || this.isMatchEnded || this.isPausedLocally) return;
                if (ptr.x < this.cameras.main.width / 2 && !this.joystickPointer) {
                    this.joystickPointer = ptr; this.moveVector = { x: 0, y: 0 };
                    this.joystickBase.setPosition(ptr.x, ptr.y).setVisible(true); this.joystickThumb.setPosition(ptr.x, ptr.y).setVisible(true);
                }
            });

            this.input.on('pointermove', (ptr) => {
                if (this.joystickPointer && ptr.id === this.joystickPointer.id) {
                    let dx = ptr.x - this.joystickBase.x, dy = ptr.y - this.joystickBase.y;
                    let dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist > 60) { dx = (dx/dist)*60; dy = (dy/dist)*60; }
                    this.joystickThumb.setPosition(this.joystickBase.x + dx, this.joystickBase.y + dy);
                    this.moveVector = { x: dx/60, y: dy/60 };
                }
            });

            const resetJoy = (ptr) => {
                if (this.joystickPointer && ptr.id === this.joystickPointer.id) {
                    this.joystickPointer = null; this.moveVector = { x: 0, y: 0 };
                    this.joystickBase.setVisible(false); this.joystickThumb.setVisible(false);
                }
            };
            this.input.on('pointerup', resetJoy); this.input.on('pointerout', resetJoy);
        }
    }

    update() {
        if (this.isCountdown || this.gameScene.isDead || this.isMatchEnded || this.isPausedLocally || !this.hasTouch) return;
        this.fireBtn.setPosition(this.cameras.main.width - 80, this.cameras.main.height - 80);
        this.fireText.setPosition(this.cameras.main.width - 80, this.cameras.main.height - 80);
    }

    startCountdown() {
        let count = 5;
        let intv = setInterval(() => {
            count--;
            if(count > 0) this.countdownText.setText(count);
            else {
                clearInterval(intv); this.countdownText.setText('FIGHT!');
                setTimeout(() => { this.countdownText.setVisible(false); this.isCountdown = false; }, 1000);
            }
        }, 1000);
    }

    updateLeaderboard(players) {
        let text = "", alive = 0;
        players.forEach((p, i) => { text += `${i+1}. ${p.name} - ${p.score}pts (${p.deaths} D)\n`; if (p.hp > 0) alive++; });
        this.leaderboardText.setText(text); this.aliveText.setText(`Alive: ${alive}`);
    }

    showDeathScreen() {
        if (this.isMatchEnded) return; 
        this.deathBg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xff0000, 0.3).setOrigin(0,0);
        this.deathText = createTxt(this, this.cameras.main.centerX, 150, 'YOU DIED', '48px', '#ff0000');
        
        let spec = createTxt(this, this.cameras.main.centerX, 250, 'SPECTATE NEXT', '20px', '#fff').setBackgroundColor('#333').setInteractive();
        let lob = createTxt(this, this.cameras.main.centerX, 320, 'RETURN TO LOBBY', '20px', '#fff').setBackgroundColor('#800').setInteractive();

        spec.on('pointerdown', () => {
            let others = this.gameScene.otherPlayers.getChildren();
            if(others.length > 0) {
                this.gameScene.isSpectating = true; this.deathBg.setVisible(false); this.deathText.setVisible(false);
                spec.setPosition(this.cameras.main.centerX - 100, this.cameras.main.height - 50);
                lob.setPosition(this.cameras.main.centerX + 100, this.cameras.main.height - 50);
                this.gameScene.spectateTarget = others[Math.floor(Math.random() * others.length)];
                this.gameScene.cameras.main.startFollow(this.gameScene.spectateTarget);
            }
        });

        lob.on('pointerdown', () => { globalSocket.emit('returnToLobby'); this.scene.stop('GameScene'); this.scene.start('LobbyScene', { roomCode: this.gameScene.roomCode }); this.scene.stop(); });
    }

    showEndScreen(leaderboard) {
        this.isMatchEnded = true;
        this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 1.0).setOrigin(0,0).setDepth(100).setInteractive(); 
        createTxt(this, this.cameras.main.centerX, 100, 'MATCH ENDED', '48px', '#00ff00').setDepth(101);
        createTxt(this, this.cameras.main.centerX, 160, leaderboard.length > 0 ? `${leaderboard[0].name} WINS!` : "DRAW!", '36px', '#ffff00').setDepth(101);
        
        let boardText = ""; leaderboard.forEach((p, i) => boardText += `${i+1}. ${p.name} - ${p.score} pts (${p.deaths} D)\n`);
        createTxt(this, this.cameras.main.centerX, 250, boardText, '20px', '#fff', false).setOrigin(0.5, 0).setDepth(101);
        createTxt(this, this.cameras.main.centerX, this.cameras.main.height - 60, 'Returning to Lobby...', '18px', '#aaa', false).setDepth(101);

        setTimeout(() => { globalSocket.emit('returnToLobby'); this.scene.stop('GameScene'); this.scene.start('LobbyScene', { roomCode: this.gameScene.roomCode }); this.scene.stop(); }, 8000);
    }
}

const config = { type: Phaser.AUTO, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, parent: 'game-container', scene: [MenuScene, LobbyScene, GameScene, UIScene] };
new Phaser.Game(config);
