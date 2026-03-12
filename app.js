const MAX_HP = 120;

const game = {
  started: false,
  ended: false,
  turn: 0,
  distance: 60,
  actors: [],
  ap: 2,
  winner: "",
  animationId: null,
  effects: [],
  celebration: null
};

const el = {
  setupCard: document.getElementById("setup-card"),
  gameCard: document.getElementById("game-card"),
  startBtn: document.getElementById("start-btn"),
  turnPill: document.getElementById("turn-pill"),
  distancePill: document.getElementById("distance-pill"),
  statusPill: document.getElementById("status-pill"),
  leftName: document.getElementById("left-name"),
  rightName: document.getElementById("right-name"),
  leftTeam: document.getElementById("left-team"),
  rightTeam: document.getElementById("right-team"),
  leftHp: document.getElementById("left-hp"),
  rightHp: document.getElementById("right-hp"),
  actionGrid: document.getElementById("action-grid"),
  restartBtn: document.getElementById("restart-btn"),
  battleLog: document.getElementById("battle-log"),
  arena: document.getElementById("arena")
};

const ctx = el.arena.getContext("2d");

function getStats(team) {
  if (team === "killybird") {
    return {
      label: "Killybird",
      icon: "KB",
      color: "#77c8ff",
      attackDamage: 14,
      specialDamage: 26,
      specialRange: 85,
      basicRange: 55,
      shieldBonus: 0.5
    };
  }

  return {
    label: "Bumblebees",
    icon: "BB",
    color: "#ffd464",
    attackDamage: 17,
    specialDamage: 22,
    specialRange: 95,
    basicRange: 50,
    shieldBonus: 0.56
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function actorName(actor, idx) {
  return idx === 0 ? "Player 1" : "Player 2";
}

function logEvent(text) {
  const li = document.createElement("li");
  li.textContent = text;
  el.battleLog.prepend(li);
  while (el.battleLog.children.length > 12) {
    el.battleLog.removeChild(el.battleLog.lastElementChild);
  }
}

function currentActor() {
  return game.actors[game.turn];
}

function otherActor() {
  return game.actors[game.turn === 0 ? 1 : 0];
}

function spendAp(cost) {
  game.ap = Math.max(0, game.ap - cost);
}

function canAct(cost) {
  return !game.ended && game.ap >= cost;
}

function inRange(range) {
  return game.distance <= range;
}

function spawnEffect(type, sourceIdx, targetIdx, hit = true) {
  game.effects.push({
    type,
    sourceIdx,
    targetIdx,
    hit,
    startedAt: performance.now(),
    durationMs: type === "shield" ? 1400 : (type === "special" ? 620 : 320)
  });
}

function applyDamage(target, amount) {
  const shielded = target.shieldHitsRemaining > 0;
  const finalAmount = Math.round(shielded ? amount * 0.35 : amount);
  target.hp = clamp(target.hp - finalAmount, 0, MAX_HP);
  if (shielded) {
    target.shieldHitsRemaining = Math.max(0, target.shieldHitsRemaining - 1);
    target.shielded = target.shieldHitsRemaining > 0;
  }

  return {
    dmg: finalAmount,
    shielded,
    shieldBroke: shielded && target.shieldHitsRemaining === 0
  };
}

function handleAction(action) {
  if (!game.started || game.ended) return;

  const actor = currentActor();
  const enemy = otherActor();
  const actorIdx = game.turn;
  const enemyIdx = game.turn === 0 ? 1 : 0;
  const stats = getStats(actor.team);

  if (action === "attack") {
    if (!canAct(1)) return;
    spendAp(1);
    if (inRange(stats.basicRange)) {
      spawnEffect("attack", actorIdx, enemyIdx, true);
      const hit = applyDamage(enemy, stats.attackDamage);
      logEvent(`${actor.name} attacks for ${hit.dmg}.`);
      if (hit.shieldBroke) logEvent(`${enemy.name}'s shield broke.`);
    } else {
      spawnEffect("attack", actorIdx, enemyIdx, false);
      logEvent(`${actor.name} missed. Too far away.`);
    }
  }

  if (action === "special") {
    if (!canAct(1)) return;
    if (actor.specialCooldown > 0) {
      logEvent(`${actor.name}'s special is still cooling down.`);
      return;
    }
    spendAp(1);
    actor.specialCooldown = 2;
    if (inRange(stats.specialRange)) {
      spawnEffect("special", actorIdx, enemyIdx, true);
      const hit = applyDamage(enemy, stats.specialDamage);
      logEvent(`${actor.name} used SPECIAL for ${hit.dmg}!`);
      if (hit.shieldBroke) logEvent(`${enemy.name}'s shield broke.`);
    } else {
      spawnEffect("special", actorIdx, enemyIdx, false);
      logEvent(`${actor.name}'s special missed.`);
    }
  }

  if (action === "shield") {
    if (!canAct(1)) return;
    spendAp(1);
    actor.shielded = true;
    actor.shieldHitsRemaining = 4;
    spawnEffect("shield", actorIdx, actorIdx, true);
    logEvent(`${actor.name} put up a shield (4 hits).`);
  }

  if (action === "moveCloser") {
    if (!canAct(1)) return;
    spendAp(1);
    game.distance = clamp(game.distance - 22, 15, 120);
    logEvent(`${actor.name} moved closer.`);
  }

  if (action === "moveAway") {
    if (!canAct(1)) return;
    spendAp(1);
    game.distance = clamp(game.distance + 22, 15, 120);
    logEvent(`${actor.name} moved away.`);
  }

  if (action === "endTurn") {
    game.ap = 0;
    logEvent(`${actor.name} ended their turn.`);
  }

  if (enemy.hp <= 0 || actor.hp <= 0) {
    finishGame();
    return;
  }

  if (game.ap <= 0) {
    nextTurn();
  }

  render();
}

function nextTurn() {
  game.turn = game.turn === 0 ? 1 : 0;
  game.ap = 2;

  const actor = currentActor();
  actor.specialCooldown = Math.max(0, actor.specialCooldown - 1);

  if (!game.ended) {
    logEvent(`${actor.name}'s turn starts.`);
  }

  render();
}

function finishGame() {
  game.ended = true;
  const [a, b] = game.actors;
  game.winner = a.hp === b.hp ? "Draw" : (a.hp > b.hp ? a.name : b.name);
  game.celebration = {
    winnerIdx: game.winner === "Draw" ? null : (a.hp > b.hp ? 0 : 1),
    startedAt: performance.now()
  };
  el.statusPill.textContent = game.winner === "Draw" ? "It is a draw." : `${game.winner} wins!`;
  logEvent(el.statusPill.textContent);
  updateControls();
  renderArena();
}

function createActors() {
  return [
    { team: "killybird", name: "Player 1", hp: MAX_HP, shielded: false, shieldHitsRemaining: 0, specialCooldown: 0 },
    { team: "bumblebees", name: "Player 2", hp: MAX_HP, shielded: false, shieldHitsRemaining: 0, specialCooldown: 0 }
  ];
}

function startGame() {
  game.actors = createActors();
  game.started = true;
  game.ended = false;
  game.turn = 0;
  game.ap = 2;
  game.distance = 60;
  game.winner = "";
  game.effects = [];
  game.celebration = null;

  el.battleLog.innerHTML = "";
  logEvent("Battle starts.");
  logEvent(`${game.actors[0].name} goes first.`);

  el.setupCard.classList.add("hidden");
  el.gameCard.classList.remove("hidden");

  render();
}

function updateControls() {
  const disableActions = game.ended;
  const buttons = Array.from(el.actionGrid.querySelectorAll("button"));

  for (const button of buttons) {
    if (button.dataset.action === "endTurn") {
      button.disabled = disableActions;
      continue;
    }

    button.disabled = disableActions || game.ap <= 0;
  }
}

function renderArena() {
  const [left, right] = game.actors;
  if (!left || !right) return;

  ctx.clearRect(0, 0, el.arena.width, el.arena.height);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(170, 90, 44, 0, Math.PI * 2);
  ctx.arc(740, 115, 32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(128, 186, 95, 0.45)";
  ctx.fillRect(0, 390, 1000, 130);

  const offset = game.distance * 2.6;
  const positions = [
    { x: 350 - offset / 2, y: 340 },
    { x: 650 + offset / 2, y: 340 }
  ];
  const t = performance.now();

  drawActor(left, positions[0].x, positions[0].y, t, game.turn === 0, game.turn === 0 ? game.ap : null);
  drawActor(right, positions[1].x, positions[1].y, t, game.turn === 1, game.turn === 1 ? game.ap : null);
  drawEffects(t, positions);
  drawCelebration(t, positions);
}

function drawActor(actor, x, y, t, isActive, apLeft) {
  const stats = getStats(actor.team);
  const flap = Math.sin(t / 110);
  const bob = Math.sin(t / 240) * 4;
  const facing = x < el.arena.width / 2 ? 1 : -1;
  const activeLift = isActive ? -16 : 0;

  ctx.save();
  ctx.translate(x, y + bob + activeLift);

  ctx.fillStyle = "rgba(33, 54, 67, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 28 - activeLift * 0.65, isActive ? 31 : 38, isActive ? 10 : 12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (actor.team === "killybird") {
    drawKillybird(stats.color, flap, facing);
  } else {
    drawBumblebee(flap, facing);
  }

  if (actor.shielded) {
    ctx.strokeStyle = "rgba(100, 205, 255, 0.9)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 47, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(28, 92, 122, 0.92)";
    ctx.font = "700 14px Baloo 2";
    ctx.textAlign = "center";
    ctx.fillText(`Shield ${actor.shieldHitsRemaining}`, 0, 64);
  }

  if (isActive && typeof apLeft === "number") {
    const badgeY = -72;
    drawRoundedRect(-36, badgeY - 18, 72, 26, 10, "rgba(255, 255, 255, 0.93)", "rgba(44, 90, 122, 0.65)");
    ctx.fillStyle = "#1f445f";
    ctx.font = "700 15px Baloo 2";
    ctx.textAlign = "center";
    ctx.fillText(`AP: ${apLeft}`, 0, badgeY);
  }

  ctx.restore();
}

function drawRoundedRect(x, y, w, h, r, fill, stroke) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawKillybird(baseColor, flap, facing) {
  ctx.save();
  ctx.scale(facing, 1);

  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#dff4ff";
  ctx.beginPath();
  ctx.ellipse(-6, 5, 16, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(flap * 0.22 - 0.1);
  ctx.fillStyle = "#5eaee8";
  ctx.beginPath();
  ctx.ellipse(-2, -2, 23, 12, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#ffb34d";
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(50, -8);
  ctx.lineTo(50, 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#1a2f45";
  ctx.beginPath();
  ctx.arc(12, -8, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBumblebee(flap, facing) {
  ctx.save();
  ctx.scale(facing, 1);

  ctx.save();
  ctx.rotate(-0.5 + flap * 0.28);
  ctx.fillStyle = "rgba(232, 247, 255, 0.85)";
  ctx.beginPath();
  ctx.ellipse(-8, -28, 20, 11, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.rotate(0.5 - flap * 0.28);
  ctx.fillStyle = "rgba(232, 247, 255, 0.85)";
  ctx.beginPath();
  ctx.ellipse(8, -28, 20, 11, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#ffd24d";
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 27, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#232b34";
  ctx.lineWidth = 6;
  [-14, -2, 10].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, -23);
    ctx.lineTo(x, 23);
    ctx.stroke();
  });

  ctx.fillStyle = "#1a2f45";
  ctx.beginPath();
  ctx.arc(12, -5, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#232b34";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(24, -17);
  ctx.quadraticCurveTo(34, -28, 40, -20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20, -21);
  ctx.quadraticCurveTo(28, -34, 35, -26);
  ctx.stroke();

  ctx.restore();
}

function drawEffects(now, positions) {
  game.effects = game.effects.filter((effect) => now - effect.startedAt <= effect.durationMs);

  for (const effect of game.effects) {
    const source = positions[effect.sourceIdx];
    const target = positions[effect.targetIdx];
    if (!source || !target) continue;
    const p = clamp((now - effect.startedAt) / effect.durationMs, 0, 1);

    if (effect.type === "attack") drawAttackEffect(source, target, p, effect.hit);
    if (effect.type === "special") drawSpecialEffect(source, target, p, effect.hit, effect.sourceIdx);
    if (effect.type === "shield") drawShieldEffect(source, p);
  }
}

function drawAttackEffect(source, target, progress, hit) {
  const x = source.x + (target.x - source.x) * progress;
  const y = source.y - 8 + (target.y - source.y) * progress;
  const alpha = 1 - progress;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.strokeStyle = hit ? "rgba(255, 98, 122, 0.95)" : "rgba(182, 198, 210, 0.8)";
  ctx.lineWidth = hit ? 10 : 6;
  ctx.beginPath();
  ctx.moveTo(source.x, source.y - 10);
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.fillStyle = hit ? "rgba(255, 88, 114, 0.95)" : "rgba(155, 173, 188, 0.8)";
  ctx.beginPath();
  ctx.arc(x, y, hit ? 12 : 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpecialEffect(source, target, progress, hit, sourceIdx) {
  const sourceActor = game.actors[sourceIdx];
  const sourceTeam = sourceActor?.team || "killybird";
  const alpha = 1 - progress * 0.65;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (sourceTeam === "killybird") {
    const curveX = source.x + (target.x - source.x) * progress;
    const curveY = source.y - 40 + Math.sin(progress * Math.PI) * -36;

    ctx.strokeStyle = "rgba(92, 205, 255, 0.9)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(source.x, source.y - 16);
    ctx.quadraticCurveTo((source.x + target.x) / 2, source.y - 86, curveX, curveY);
    ctx.stroke();

    if (hit) {
      ctx.fillStyle = "rgba(126, 224, 255, 0.95)";
      for (let i = 0; i < 5; i += 1) {
        const angle = (Math.PI * 2 * i) / 5 + progress * 4;
        const r = 8 + progress * 22;
        ctx.beginPath();
        ctx.arc(target.x + Math.cos(angle) * r, target.y - 18 + Math.sin(angle) * r, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    const pulseRadius = 12 + progress * 46;
    ctx.strokeStyle = hit ? "rgba(255, 207, 86, 0.95)" : "rgba(255, 232, 170, 0.8)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(target.x, target.y - 8, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 167, 49, 0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(source.x, source.y - 10);
    ctx.lineTo(target.x, target.y - 8);
    ctx.stroke();
  }

  ctx.restore();
}

function drawShieldEffect(source, progress) {
  const ring = 48 + progress * 22;
  const alpha = 1 - progress;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(104, 213, 255, 0.95)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(source.x, source.y, ring, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(173, 236, 255, 0.9)";
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6 + progress * 5;
    ctx.beginPath();
    ctx.arc(source.x + Math.cos(angle) * ring, source.y + Math.sin(angle) * ring, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCelebration(now, positions) {
  if (!game.ended || !game.celebration || game.celebration.winnerIdx == null) return;

  const winnerPos = positions[game.celebration.winnerIdx];
  if (!winnerPos) return;

  const elapsed = now - game.celebration.startedAt;
  const pulse = (Math.sin(now / 140) + 1) / 2;
  const sparkleCount = 16;

  for (let i = 0; i < sparkleCount; i += 1) {
    const angle = (Math.PI * 2 * i) / sparkleCount + now / 550;
    const radius = 52 + (i % 4) * 10 + Math.sin(now / 260 + i) * 5;
    const x = winnerPos.x + Math.cos(angle) * radius;
    const y = winnerPos.y - 38 + Math.sin(angle) * (20 + pulse * 6);

    ctx.fillStyle = i % 2 === 0 ? "rgba(255, 220, 84, 0.95)" : "rgba(124, 215, 255, 0.95)";
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }

  ctx.save();
  ctx.translate(winnerPos.x, winnerPos.y - 90 - pulse * 6);
  ctx.rotate(Math.sin(now / 300) * 0.1);

  ctx.fillStyle = "rgba(255, 195, 62, 0.96)";
  ctx.beginPath();
  ctx.moveTo(-22, 8);
  ctx.lineTo(-14, -11);
  ctx.lineTo(-5, 2);
  ctx.lineTo(0, -15);
  ctx.lineTo(7, 2);
  ctx.lineTo(15, -11);
  ctx.lineTo(22, 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 236, 180, 0.96)";
  ctx.fillRect(-22, 8, 44, 8);
  ctx.restore();

  ctx.save();
  const labelW = 132;
  const labelH = 28;
  const labelX = winnerPos.x - labelW / 2;
  const labelY = winnerPos.y - 145 - pulse * 7;
  drawRoundedRect(labelX, labelY, labelW, labelH, 11, "rgba(255,255,255,0.94)", "rgba(62, 121, 160, 0.7)");
  ctx.fillStyle = "#22506f";
  ctx.font = "700 16px Baloo 2";
  ctx.textAlign = "center";
  ctx.fillText("Victory!", winnerPos.x, labelY + 19);
  ctx.restore();

  if (elapsed < 2600) {
    ctx.save();
    ctx.globalAlpha = 1 - elapsed / 2600;
    ctx.strokeStyle = "rgba(255, 242, 171, 0.9)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(winnerPos.x, winnerPos.y - 8, 56 + elapsed / 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function animateArena() {
  renderArena();
  game.animationId = requestAnimationFrame(animateArena);
}

function render() {
  if (!game.started) return;

  const [left, right] = game.actors;
  el.leftName.textContent = actorName(left, 0);
  el.rightName.textContent = actorName(right, 1);
  el.leftTeam.textContent = getStats(left.team).label;
  el.rightTeam.textContent = getStats(right.team).label;
  el.leftHp.style.width = `${(left.hp / MAX_HP) * 100}%`;
  el.rightHp.style.width = `${(right.hp / MAX_HP) * 100}%`;

  const actor = currentActor();
  el.turnPill.textContent = `Turn: ${actor.name}`;
  el.distancePill.textContent = `Distance: ${game.distance}`;

  if (!game.ended) {
    el.statusPill.textContent = `Action points: ${game.ap}`;
  }

  updateControls();
  renderArena();
}

function bindUi() {
  el.startBtn.addEventListener("click", startGame);

  el.actionGrid.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;
    handleAction(actionButton.dataset.action);
  });

  el.restartBtn.addEventListener("click", () => {
    game.started = false;
    game.effects = [];
    game.celebration = null;
    el.gameCard.classList.add("hidden");
    el.setupCard.classList.remove("hidden");
  });
}

bindUi();
animateArena();
